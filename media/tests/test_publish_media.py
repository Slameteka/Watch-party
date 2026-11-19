"""Unit tests for media/scripts/publish_media.py."""

import json
from decimal import Decimal
from pathlib import Path

import boto3
import publish_media as pm
import pytest
from moto import mock_aws

REGION = "ap-southeast-1"


def write_hls_tree(root: Path, media_id: str = "sintel", segment_sec: float = 4.0) -> Path:
    """Create a tiny but complete HLS output folder like `transcode` produces."""
    media_dir = root / media_id
    master = ["#EXTM3U", "#EXT-X-VERSION:7"]
    for index, (name, resolution) in enumerate((("360p", "640x272"), ("1080p", "1920x818"))):
        folder = media_dir / name
        folder.mkdir(parents=True)
        (folder / f"init_{index}.mp4").write_bytes(b"init")
        lines = [
            "#EXTM3U",
            "#EXT-X-VERSION:7",
            "#EXT-X-TARGETDURATION:4",
            "#EXT-X-PLAYLIST-TYPE:VOD",
            f'#EXT-X-MAP:URI="init_{index}.mp4"',
        ]
        for seg in range(2):
            (folder / f"seg_{seg:05d}.m4s").write_bytes(b"data")
            lines += [f"#EXTINF:{segment_sec:.6f},", f"seg_{seg:05d}.m4s"]
        lines.append("#EXT-X-ENDLIST")
        (folder / "index.m3u8").write_text("\n".join(lines) + "\n")
        master += [
            f"#EXT-X-STREAM-INF:BANDWIDTH={1000000 * (index + 1)},RESOLUTION={resolution},"
            'CODECS="avc1.64001e,mp4a.40.2"',
            f"{name}/index.m3u8",
        ]
    (media_dir / "master.m3u8").write_text("\n".join(master) + "\n")
    (media_dir / "poster.jpg").write_bytes(b"jpeg")
    (media_dir / "manifest.json").write_text(json.dumps({"mediaId": media_id, "durationSec": 8.0}))
    return media_dir


# --- catalog -----------------------------------------------------------------


def test_repo_catalog_is_valid():
    catalog = pm.load_catalog(pm.DEFAULT_CATALOG)
    assert set(catalog) == {"big-buck-bunny", "sintel", "tears-of-steel"}
    for entry in catalog.values():
        assert entry["license"] == "CC BY 3.0"
        assert entry["attribution"]
        assert len(entry["source"]["sha256"]) == 64


@pytest.mark.parametrize("bad", ["", "Sintel", "../etc", "a" * 65, "sin tel"])
def test_validate_media_id_rejects_bad_values(bad):
    with pytest.raises(pm.PublishError):
        pm.validate_media_id(bad)


def test_load_catalog_rejects_duplicate_sort_order(tmp_path):
    item = {"title": "t", "description": "d", "license": "l", "attribution": "a", "sortOrder": 1}
    path = tmp_path / "catalog.json"
    path.write_text(json.dumps({"items": [{**item, "mediaId": "a"}, {**item, "mediaId": "b"}]}))
    with pytest.raises(pm.PublishError, match="sortOrder"):
        pm.load_catalog(path)


# --- ffmpeg arguments --------------------------------------------------------


def test_ladder_vbv_values_match_architecture():
    assert [(r.maxrate_kbps, r.bufsize_kbps) for r in pm.LADDER] == [
        (856, 1200),
        (1498, 2100),
        (2996, 4200),
        (5350, 7500),
    ]


def test_select_renditions_never_upscales():
    assert [r.name for r in pm.select_renditions(1920)] == ["360p", "480p", "720p", "1080p"]
    assert [r.name for r in pm.select_renditions(1280)] == ["360p", "480p", "720p"]
    with pytest.raises(pm.PublishError):
        pm.select_renditions(320)


def test_build_hls_args_has_aligned_keyframes_and_fmp4():
    args = pm.build_hls_args("/in/source.mkv", list(pm.LADDER))
    joined = " ".join(args)
    assert "-force_key_frames expr:gte(t,n_forced*2)" in joined
    assert "-sc_threshold 0" in joined
    assert "-hls_time 4" in joined
    assert "-hls_segment_type fmp4" in joined
    assert "-hls_playlist_type vod" in joined
    assert "[s0]scale=640:-2,setsar=1[v0]" in joined
    assert args.count("0:a:0") == 4
    assert args[args.index("-var_stream_map") + 1] == (
        "v:0,a:0,name:360p v:1,a:1,name:480p v:2,a:2,name:720p v:3,a:3,name:1080p"
    )


def test_docker_command_mounts_source_read_only(tmp_path):
    source = tmp_path / "Film File.mkv"
    source.write_bytes(b"x")
    runner = pm.FfmpegRunner("docker")
    command = runner.ffmpeg_command(["-version"], source, tmp_path)
    assert command[:3] == ["docker", "run", "--rm"]
    assert f"{source.resolve()}:/in/source.mkv:ro,z" in command
    assert pm.FFMPEG_IMAGE in command
    assert runner.input_path(source) == "/in/source.mkv"


def test_docker_command_rejects_colon_in_path(tmp_path):
    source = tmp_path / "a:b.mkv"
    source.write_bytes(b"x")
    with pytest.raises(pm.PublishError, match="':'"):
        pm.FfmpegRunner("docker").ffprobe_command(source)


def test_summarize_probe_requires_audio():
    probe = {"streams": [{"codec_type": "video", "width": 1920, "height": 800}], "format": {}}
    with pytest.raises(pm.PublishError, match="audio"):
        pm.summarize_probe(probe)


# --- HLS verification --------------------------------------------------------


def test_verify_output_accepts_complete_tree(tmp_path):
    result = pm.verify_output(write_hls_tree(tmp_path))
    assert result["durationSec"] == 8.0
    assert [v["RESOLUTION"] for v in result["variants"]] == ["640x272", "1920x818"]


def test_verify_output_reports_missing_segment_and_long_segment(tmp_path):
    media_dir = write_hls_tree(tmp_path, segment_sec=6.0)
    (media_dir / "360p" / "seg_00001.m4s").unlink()
    with pytest.raises(pm.PublishError) as error:
        pm.verify_output(media_dir)
    assert "seg_00001.m4s missing" in str(error.value)
    assert "(> 4 s)" in str(error.value)


def test_verify_output_requires_endlist(tmp_path):
    media_dir = write_hls_tree(tmp_path)
    playlist = media_dir / "1080p" / "index.m3u8"
    playlist.write_text(playlist.read_text().replace("#EXT-X-ENDLIST\n", ""))
    with pytest.raises(pm.PublishError, match="complete VOD"):
        pm.verify_output(media_dir)


# --- upload ------------------------------------------------------------------


def test_plan_upload_keys_types_and_master_last(tmp_path):
    plan = pm.plan_upload("sintel", write_hls_tree(tmp_path))
    keys = {key: content_type for _, key, content_type in plan}
    assert keys["posters/sintel.jpg"] == "image/jpeg"
    assert keys["media/sintel/360p/seg_00000.m4s"] == "video/iso.segment"
    assert keys["media/sintel/360p/init_0.mp4"] == "video/mp4"
    assert keys["media/sintel/master.m3u8"] == "application/vnd.apple.mpegurl"
    assert not any(key.endswith("manifest.json") for key in keys)
    assert plan[-1][1] == "media/sintel/master.m3u8"


def test_plan_upload_refuses_unknown_files(tmp_path):
    media_dir = write_hls_tree(tmp_path)
    (media_dir / "notes.txt").write_text("x")
    with pytest.raises(pm.PublishError, match="notes.txt"):
        pm.plan_upload("sintel", media_dir)


@mock_aws
def test_upload_sets_content_type_and_cache_control(tmp_path, monkeypatch):
    monkeypatch.setenv("AWS_DEFAULT_REGION", REGION)
    s3 = boto3.client("s3", region_name=REGION)
    s3.create_bucket(Bucket="media", CreateBucketConfiguration={"LocationConstraint": REGION})
    write_hls_tree(tmp_path)

    code = pm.main(["upload", "sintel", "--out-dir", str(tmp_path), "--bucket", "media"])

    assert code == 0
    head = s3.head_object(Bucket="media", Key="media/sintel/master.m3u8")
    assert head["ContentType"] == "application/vnd.apple.mpegurl"
    assert head["CacheControl"] == pm.CACHE_CONTROL
    assert s3.head_object(Bucket="media", Key="posters/sintel.jpg")["ContentType"] == "image/jpeg"
    listed = s3.list_objects_v2(Bucket="media")["KeyCount"]
    assert listed == len(pm.plan_upload("sintel", tmp_path / "sintel"))


@mock_aws
def test_upload_dry_run_writes_nothing(tmp_path):
    s3 = boto3.client("s3", region_name=REGION)
    s3.create_bucket(Bucket="media", CreateBucketConfiguration={"LocationConstraint": REGION})
    write_hls_tree(tmp_path)

    code = pm.main(
        ["upload", "sintel", "--out-dir", str(tmp_path), "--bucket", "media", "--dry-run"]
    )

    assert code == 0
    assert s3.list_objects_v2(Bucket="media")["KeyCount"] == 0


# --- register ----------------------------------------------------------------


def test_build_catalog_item_paths_and_compat_urls():
    entry = pm.load_catalog(pm.DEFAULT_CATALOG)["sintel"]
    item = pm.build_catalog_item(entry, 888.0, "watchparty.chescloud.my.id")
    assert item["PK"] == "CATALOG"
    assert item["SK"] == "MEDIA#sintel"
    assert item["durationSec"] == Decimal("888.0")
    assert item["playbackPath"] == "/media/sintel/master.m3u8"
    assert item["posterPath"] == "/posters/sintel.jpg"
    assert item["playbackUrl"] == "https://watchparty.chescloud.my.id/media/sintel/master.m3u8"
    with pytest.raises(pm.PublishError, match="domain"):
        pm.build_catalog_item(entry, 888.0, "https://evil.example/x")


def create_main_table():
    dynamodb = boto3.resource("dynamodb", region_name=REGION)
    return dynamodb.create_table(
        TableName="main",
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "PK", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


@mock_aws
def test_register_writes_catalog_item(tmp_path):
    table = create_main_table()
    write_hls_tree(tmp_path)
    argv = ["register", "sintel", "--out-dir", str(tmp_path), "--table", "main"]

    assert pm.main([*argv, "--app-domain", "watchparty.chescloud.my.id", "--dry-run"]) == 0
    assert "Item" not in table.get_item(Key={"PK": "CATALOG", "SK": "MEDIA#sintel"})

    assert pm.main([*argv, "--app-domain", "watchparty.chescloud.my.id"]) == 0
    item = table.get_item(Key={"PK": "CATALOG", "SK": "MEDIA#sintel"})["Item"]
    assert item["title"] == "Sintel"
    assert item["durationSec"] == Decimal("8.0")
    assert item["sortOrder"] == 2
