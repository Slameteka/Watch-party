#!/usr/bin/env python3
"""Publish a catalog film as HLS for Watch Party.

Steps (architecture.md §5.4, ADR-0005):
  transcode  source file -> HLS (4 renditions, fMP4, 4 s segments) + poster, with a pinned ffmpeg
  verify     check the HLS output before it leaves the laptop
  upload     copy the output to the media bucket (media/<mediaId>/..., posters/<mediaId>.jpg)
  register   write the catalog item (PK CATALOG, SK MEDIA#<mediaId>) to the main DynamoDB table

Run `uv run python scripts/publish_media.py --help` from the media/ folder. See media/README.md.
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any

import boto3

# Pinned ffmpeg build with libx264 (Fedora's ffmpeg-free has no libx264). Change = new PR.
FFMPEG_IMAGE = "linuxserver/ffmpeg:9.0.2-cli-ls89"

# Values from architecture.md §5.4.
SEGMENT_SEC = 4
KEYFRAME_INTERVAL_SEC = 2
AUDIO_BITRATE = "128k"
AUDIO_SAMPLE_RATE = 48000
VBV_MAXRATE_FACTOR = 1.07
VBV_BUFSIZE_FACTOR = 1.5
POSTER_WIDTH = 640
CACHE_CONTROL = "public, max-age=31536000, immutable"

MASTER_PLAYLIST = "master.m3u8"
POSTER_FILE = "poster.jpg"
MANIFEST_FILE = "manifest.json"
DEFAULT_CATALOG = Path(__file__).resolve().parent.parent / "catalog.json"
DEFAULT_REGION = "ap-southeast-1"

MEDIA_ID_PATTERN = re.compile(r"^[a-z0-9-]{1,64}$")  # MediaId in docs/contracts/openapi.yaml
DOMAIN_PATTERN = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")

CONTENT_TYPES = {
    ".m3u8": "application/vnd.apple.mpegurl",
    ".mp4": "video/mp4",
    ".m4s": "video/iso.segment",
    ".jpg": "image/jpeg",
}


class PublishError(Exception):
    """Expected failure with a message for the operator."""


@dataclass(frozen=True)
class Rendition:
    name: str
    width: int
    video_kbps: int

    @property
    def maxrate_kbps(self) -> int:
        return round(self.video_kbps * VBV_MAXRATE_FACTOR)

    @property
    def bufsize_kbps(self) -> int:
        return round(self.video_kbps * VBV_BUFSIZE_FACTOR)


# Width-based ladder: the height follows the source aspect ratio (Sintel and Tears of Steel
# are wider than 16:9). Names stay the quality tiers used by the UI (F-2.6).
LADDER = (
    Rendition("360p", 640, 800),
    Rendition("480p", 854, 1400),
    Rendition("720p", 1280, 2800),
    Rendition("1080p", 1920, 5000),
)


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------


def validate_media_id(media_id: str) -> str:
    if not MEDIA_ID_PATTERN.fullmatch(media_id):
        raise PublishError(f"invalid mediaId {media_id!r}: must match {MEDIA_ID_PATTERN.pattern}")
    return media_id


def load_catalog(path: Path) -> dict[str, dict[str, Any]]:
    """Read media/catalog.json and return the items by mediaId."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        raise PublishError(f"cannot read catalog {path}: {e}") from e

    required = ("mediaId", "title", "description", "sortOrder", "license", "attribution")
    items: dict[str, dict[str, Any]] = {}
    sort_orders: set[int] = set()
    for entry in data.get("items", []):
        missing = [key for key in required if key not in entry]
        if missing:
            raise PublishError(f"catalog item {entry.get('mediaId')!r} misses {missing}")
        media_id = validate_media_id(entry["mediaId"])
        if media_id in items:
            raise PublishError(f"duplicate mediaId {media_id!r} in catalog")
        sort_order = entry["sortOrder"]
        if not isinstance(sort_order, int) or sort_order in sort_orders:
            raise PublishError(f"sortOrder of {media_id!r} must be a unique integer")
        sha = entry.get("source", {}).get("sha256")
        if sha is not None and not SHA256_PATTERN.fullmatch(sha):
            raise PublishError(f"source.sha256 of {media_id!r} is not a SHA-256 hex digest")
        sort_orders.add(sort_order)
        items[media_id] = entry
    if not items:
        raise PublishError(f"catalog {path} has no items")
    return items


def catalog_entry(catalog: dict[str, dict[str, Any]], media_id: str) -> dict[str, Any]:
    validate_media_id(media_id)
    if media_id not in catalog:
        raise PublishError(f"mediaId {media_id!r} is not in the catalog file")
    return catalog[media_id]


# ---------------------------------------------------------------------------
# ffmpeg command building (pure functions, unit tested)
# ---------------------------------------------------------------------------


def select_renditions(source_width: int) -> list[Rendition]:
    """Keep only renditions that do not upscale the source."""
    selected = [r for r in LADDER if r.width <= source_width]
    if not selected:
        raise PublishError(f"source width {source_width}px is below the smallest rendition")
    return selected


def build_hls_args(input_path: str, renditions: list[Rendition]) -> list[str]:
    """ffmpeg arguments for the HLS ladder. Output goes to the current working directory."""
    count = len(renditions)
    splits = "".join(f"[s{i}]" for i in range(count))
    scales = ";".join(f"[s{i}]scale={r.width}:-2,setsar=1[v{i}]" for i, r in enumerate(renditions))
    args = ["-nostdin", "-y", "-hide_banner", "-loglevel", "warning", "-stats"]
    args += ["-i", input_path, "-filter_complex", f"[0:v]split={count}{splits};{scales}"]
    for i in range(count):
        args += ["-map", f"[v{i}]"]
    for _ in range(count):
        args += ["-map", "0:a:0"]
    args += ["-c:v", "libx264", "-preset", "medium", "-profile:v", "high", "-pix_fmt", "yuv420p"]
    # Fixed 2 s GOP with no scene-cut keyframes keeps keyframes aligned across renditions.
    args += ["-force_key_frames", f"expr:gte(t,n_forced*{KEYFRAME_INTERVAL_SEC})"]
    args += ["-sc_threshold", "0"]
    for i, r in enumerate(renditions):
        args += [f"-b:v:{i}", f"{r.video_kbps}k"]
        args += [f"-maxrate:v:{i}", f"{r.maxrate_kbps}k", f"-bufsize:v:{i}", f"{r.bufsize_kbps}k"]
    args += ["-c:a", "aac", "-b:a", AUDIO_BITRATE, "-ac", "2", "-ar", str(AUDIO_SAMPLE_RATE)]
    args += ["-f", "hls", "-hls_time", str(SEGMENT_SEC), "-hls_playlist_type", "vod"]
    args += ["-hls_segment_type", "fmp4", "-hls_flags", "independent_segments"]
    args += ["-hls_segment_filename", "%v/seg_%05d.m4s", "-master_pl_name", MASTER_PLAYLIST]
    stream_map = " ".join(f"v:{i},a:{i},name:{r.name}" for i, r in enumerate(renditions))
    args += ["-var_stream_map", stream_map, "%v/index.m3u8"]
    return args


def build_poster_args(input_path: str, at_sec: float) -> list[str]:
    return [
        "-nostdin", "-y", "-hide_banner", "-loglevel", "error",
        "-ss", str(at_sec), "-i", input_path,
        "-frames:v", "1", "-vf", f"scale={POSTER_WIDTH}:-2", "-q:v", "3", POSTER_FILE,
    ]  # fmt: skip


class FfmpegRunner:
    """Runs ffmpeg/ffprobe in the pinned Docker image (default) or from the local PATH."""

    def __init__(self, engine: str = "docker", image: str = FFMPEG_IMAGE) -> None:
        if engine not in ("docker", "local"):
            raise PublishError(f"unknown engine {engine!r}")
        self.engine = engine
        self.image = image

    @staticmethod
    def _container_input(source: Path) -> str:
        return f"/in/source{source.suffix.lower()}"

    def input_path(self, source: Path) -> str:
        return self._container_input(source) if self.engine == "docker" else str(source)

    def _mount(self, host: Path, container: str, read_only: bool) -> str:
        host_path = str(host.resolve())
        if ":" in host_path:
            raise PublishError(f"path must not contain ':' for a Docker bind mount: {host_path}")
        # ':z' relabels for SELinux (Fedora); other hosts ignore it.
        return f"{host_path}:{container}:{'ro,z' if read_only else 'z'}"

    def ffmpeg_command(self, args: list[str], source: Path, workdir: Path) -> list[str]:
        if self.engine == "local":
            return ["ffmpeg", *args]
        uid = getattr(os, "getuid", lambda: 1000)()
        gid = getattr(os, "getgid", lambda: 1000)()
        return [
            "docker", "run", "--rm", "-e", f"PUID={uid}", "-e", f"PGID={gid}",
            "-v", self._mount(source, self._container_input(source), read_only=True),
            "-v", self._mount(workdir, "/out", read_only=False), "-w", "/out",
            self.image, *args,
        ]  # fmt: skip

    def ffprobe_command(self, source: Path) -> list[str]:
        probe = ["-v", "error", "-print_format", "json", "-show_streams", "-show_format"]
        if self.engine == "local":
            return ["ffprobe", *probe, str(source)]
        return [
            "docker", "run", "--rm", "--entrypoint", "ffprobe",
            "-v", self._mount(source, self._container_input(source), read_only=True),
            self.image, *probe, self._container_input(source),
        ]  # fmt: skip

    def check(self) -> None:
        if self.engine == "local":
            result = subprocess.run(
                ["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True
            )
            if " libx264 " not in result.stdout:
                raise PublishError("local ffmpeg has no libx264 encoder; use --engine docker")

    def run_ffmpeg(self, args: list[str], source: Path, workdir: Path) -> None:
        command = self.ffmpeg_command(args, source, workdir)
        cwd = workdir if self.engine == "local" else None
        if subprocess.run(command, cwd=cwd).returncode != 0:
            raise PublishError("ffmpeg failed (see the output above)")

    def probe(self, source: Path) -> dict[str, Any]:
        result = subprocess.run(self.ffprobe_command(source), capture_output=True, text=True)
        if result.returncode != 0:
            raise PublishError(f"ffprobe failed: {result.stderr.strip()}")
        return json.loads(result.stdout)


def summarize_probe(probe: dict[str, Any]) -> dict[str, Any]:
    video = next((s for s in probe.get("streams", []) if s.get("codec_type") == "video"), None)
    has_audio = any(s.get("codec_type") == "audio" for s in probe.get("streams", []))
    if video is None:
        raise PublishError("source has no video stream")
    if not has_audio:
        raise PublishError("source has no audio stream")
    return {
        "width": int(video["width"]),
        "height": int(video["height"]),
        "durationSec": float(probe["format"]["duration"]),
    }


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


# ---------------------------------------------------------------------------
# HLS verification
# ---------------------------------------------------------------------------


def parse_attributes(line: str) -> dict[str, str]:
    """Parse `KEY=VALUE,KEY="a,b"` from an #EXT-X tag."""
    body = line.split(":", 1)[1] if ":" in line else ""
    return {k: v.strip('"') for k, v in re.findall(r'([A-Z0-9-]+)=("[^"]*"|[^,]*)', body)}


def parse_master(text: str) -> list[dict[str, str]]:
    variants = []
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for i, line in enumerate(lines):
        if line.startswith("#EXT-X-STREAM-INF:") and i + 1 < len(lines):
            variants.append({**parse_attributes(line), "URI": lines[i + 1]})
    return variants


def parse_media_playlist(text: str) -> dict[str, Any]:
    segments: list[tuple[float, str]] = []
    init = None
    target = None
    pending: float | None = None
    for line in (raw.strip() for raw in text.splitlines()):
        if line.startswith("#EXT-X-TARGETDURATION:"):
            target = int(line.split(":", 1)[1])
        elif line.startswith("#EXT-X-MAP:"):
            init = parse_attributes(line).get("URI")
        elif line.startswith("#EXTINF:"):
            pending = float(line.split(":", 1)[1].split(",", 1)[0])
        elif line and not line.startswith("#") and pending is not None:
            segments.append((pending, line))
            pending = None
    return {
        "targetDuration": target,
        "init": init,
        "segments": segments,
        "vod": "#EXT-X-PLAYLIST-TYPE:VOD" in text,
        "ended": "#EXT-X-ENDLIST" in text,
        "durationSec": sum(duration for duration, _ in segments),
    }


def verify_output(media_dir: Path) -> dict[str, Any]:
    """Check the HLS tree. Raises PublishError listing every problem found."""
    problems: list[str] = []
    master = media_dir / MASTER_PLAYLIST
    if not master.is_file():
        raise PublishError(f"{master} not found")
    variants = parse_master(master.read_text(encoding="utf-8"))
    if not variants:
        problems.append("master playlist has no variants")

    durations = []
    for variant in variants:
        name = variant["URI"]
        for attr in ("BANDWIDTH", "RESOLUTION", "CODECS"):
            if attr not in variant:
                problems.append(f"{name}: master entry misses {attr}")
        playlist_path = media_dir / name
        if not playlist_path.is_file():
            problems.append(f"{name}: playlist file missing")
            continue
        playlist = parse_media_playlist(playlist_path.read_text(encoding="utf-8"))
        folder = playlist_path.parent
        if not (playlist["vod"] and playlist["ended"]):
            problems.append(f"{name}: not a complete VOD playlist")
        if playlist["targetDuration"] is None or playlist["targetDuration"] > SEGMENT_SEC:
            problems.append(f"{name}: EXT-X-TARGETDURATION must be <= {SEGMENT_SEC}")
        if not playlist["init"] or not (folder / playlist["init"]).is_file():
            problems.append(f"{name}: init segment missing")
        if not playlist["segments"]:
            problems.append(f"{name}: no segments")
        for duration, uri in playlist["segments"]:
            segment = folder / uri
            if not segment.is_file() or segment.stat().st_size == 0:
                problems.append(f"{name}: segment {uri} missing or empty")
            if duration > SEGMENT_SEC + 0.01:
                problems.append(f"{name}: segment {uri} is {duration:.3f} s (> {SEGMENT_SEC} s)")
        durations.append(playlist["durationSec"])

    if durations and max(durations) - min(durations) > 0.1:
        problems.append(f"renditions have different durations: {durations}")
    if not (media_dir / POSTER_FILE).is_file():
        problems.append(f"{POSTER_FILE} missing")
    if problems:
        raise PublishError("HLS verification failed:\n  - " + "\n  - ".join(problems))
    return {"variants": variants, "durationSec": round(min(durations), 3)}


# ---------------------------------------------------------------------------
# S3 upload and catalog registration
# ---------------------------------------------------------------------------


def content_type_for(path: Path) -> str:
    try:
        return CONTENT_TYPES[path.suffix.lower()]
    except KeyError as e:
        raise PublishError(f"no Content-Type for {path.name}; refusing to upload it") from e


def s3_key_for(media_id: str, relative: Path) -> str:
    if relative.as_posix() == POSTER_FILE:
        return f"posters/{media_id}.jpg"
    return f"media/{media_id}/{relative.as_posix()}"


def plan_upload(media_id: str, media_dir: Path) -> list[tuple[Path, str, str]]:
    """(local file, S3 key, Content-Type). The master playlist is last so a partial upload
    is never playable."""
    files = sorted(p for p in media_dir.rglob("*") if p.is_file() and p.name != MANIFEST_FILE)
    plan = [(p, s3_key_for(media_id, p.relative_to(media_dir)), content_type_for(p)) for p in files]
    return sorted(plan, key=lambda item: item[0].name == MASTER_PLAYLIST)


def build_catalog_item(entry: dict[str, Any], duration_sec: float, app_domain: str) -> dict:
    media_id = validate_media_id(entry["mediaId"])
    if not DOMAIN_PATTERN.fullmatch(app_domain):
        raise PublishError(f"invalid app domain {app_domain!r}")
    poster_path = f"/posters/{media_id}.jpg"
    playback_path = f"/media/{media_id}/{MASTER_PLAYLIST}"
    return {
        "PK": "CATALOG",
        "SK": f"MEDIA#{media_id}",
        "mediaId": media_id,
        "title": entry["title"],
        "description": entry["description"],
        "durationSec": Decimal(str(round(duration_sec, 3))),
        "posterPath": poster_path,
        "playbackPath": playback_path,
        "sortOrder": entry["sortOrder"],
        "license": entry["license"],
        "attribution": entry["attribution"],
        # Compatibility: backend RoomRepository still reads full URLs. Remove when it builds
        # them from posterPath/playbackPath (architecture.md §7.2).
        "posterUrl": f"https://{app_domain}{poster_path}",
        "playbackUrl": f"https://{app_domain}{playback_path}",
    }


def aws_session(profile: str | None, region: str) -> boto3.session.Session:
    return boto3.session.Session(profile_name=profile, region_name=region)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def media_dir_for(out_dir: Path, media_id: str) -> Path:
    return out_dir / validate_media_id(media_id)


def cmd_transcode(args: argparse.Namespace) -> None:
    catalog = load_catalog(args.catalog)
    entry = catalog_entry(catalog, args.media_id)
    source: Path = args.source
    if not source.is_file():
        raise PublishError(f"source file {source} not found")

    expected_sha = entry.get("source", {}).get("sha256")
    if expected_sha:
        log(f"checking SHA-256 of {source.name} ...")
        actual_sha = sha256_of(source)
        if actual_sha != expected_sha:
            raise PublishError(f"SHA-256 mismatch: expected {expected_sha}, got {actual_sha}")

    media_dir = media_dir_for(args.out_dir, args.media_id)
    if media_dir.exists() and any(media_dir.iterdir()):
        raise PublishError(f"{media_dir} is not empty; remove it first")
    media_dir.mkdir(parents=True, exist_ok=True)

    runner = FfmpegRunner(args.engine, args.image)
    runner.check()
    info = summarize_probe(runner.probe(source))
    renditions = select_renditions(info["width"])
    log(f"source {info['width']}x{info['height']}, {info['durationSec']:.2f} s")
    log(f"renditions: {', '.join(r.name for r in renditions)}")

    started = time.monotonic()
    runner.run_ffmpeg(build_hls_args(runner.input_path(source), renditions), source, media_dir)
    poster_args = build_poster_args(runner.input_path(source), float(entry.get("posterAtSec", 0)))
    runner.run_ffmpeg(poster_args, source, media_dir)
    result = verify_output(media_dir)

    manifest = {
        "mediaId": args.media_id,
        "durationSec": result["durationSec"],
        "source": {"fileName": source.name, "sha256": expected_sha, **info},
        "renditions": [
            {"uri": v["URI"], "resolution": v["RESOLUTION"], "bandwidth": int(v["BANDWIDTH"])}
            for v in result["variants"]
        ],
        "ffmpeg": args.image if args.engine == "docker" else "local",
        "elapsedSec": round(time.monotonic() - started),
    }
    (media_dir / MANIFEST_FILE).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    log(f"done in {manifest['elapsedSec']} s -> {media_dir}")


def cmd_verify(args: argparse.Namespace) -> None:
    result = verify_output(media_dir_for(args.out_dir, args.media_id))
    for variant in result["variants"]:
        log(f"{variant['URI']}: {variant['RESOLUTION']} @ {variant['BANDWIDTH']} bps")
    log(f"OK, duration {result['durationSec']} s")


def cmd_upload(args: argparse.Namespace) -> None:
    media_dir = media_dir_for(args.out_dir, args.media_id)
    verify_output(media_dir)
    if not args.bucket:
        raise PublishError("--bucket (or MEDIA_BUCKET) is required")
    plan = plan_upload(args.media_id, media_dir)
    total_bytes = sum(path.stat().st_size for path, _, _ in plan)
    log(f"{len(plan)} files, {total_bytes / 1e6:.1f} MB -> s3://{args.bucket}/")
    if args.dry_run:
        for path, key, content_type in plan[:3] + plan[-2:]:
            log(f"  [dry-run] {path.name} -> {key} ({content_type})")
        return

    s3 = aws_session(args.profile, args.region).client("s3")

    def put(item: tuple[Path, str, str]) -> None:
        path, key, content_type = item
        extra = {"ContentType": content_type, "CacheControl": CACHE_CONTROL}
        s3.upload_file(str(path), args.bucket, key, ExtraArgs=extra)

    body, master = plan[:-1], plan[-1:]
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(put, body))
    for item in master:
        put(item)
    log(f"uploaded {len(plan)} files")


def cmd_register(args: argparse.Namespace) -> None:
    catalog = load_catalog(args.catalog)
    entry = catalog_entry(catalog, args.media_id)
    manifest_path = media_dir_for(args.out_dir, args.media_id) / MANIFEST_FILE
    if not manifest_path.is_file():
        raise PublishError(f"{manifest_path} not found; run transcode first")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not args.table:
        raise PublishError("--table (or MAIN_TABLE_NAME) is required")
    if not args.app_domain:
        raise PublishError("--app-domain (or APP_DOMAIN) is required")

    item = build_catalog_item(entry, float(manifest["durationSec"]), args.app_domain)
    if args.dry_run:
        log(f"[dry-run] PutItem into {args.table}:")
        print(json.dumps(item, indent=2, ensure_ascii=False, default=str))
        return
    table = aws_session(args.profile, args.region).resource("dynamodb").Table(args.table)
    table.put_item(Item=item)
    log(f"registered {item['SK']} in {args.table}")


def log(message: str) -> None:
    print(f"[publish_media] {message}", file=sys.stderr, flush=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n", 1)[0])
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG, help="catalog JSON file")
    sub = parser.add_subparsers(dest="command", required=True)

    def common(name: str, help_text: str) -> argparse.ArgumentParser:
        p = sub.add_parser(name, help=help_text)
        p.add_argument("media_id", help="mediaId from catalog.json, e.g. sintel")
        p.add_argument("--out-dir", type=Path, required=True, help="work folder outside the repo")
        return p

    def aws(p: argparse.ArgumentParser) -> None:
        p.add_argument("--region", default=os.getenv("AWS_REGION", DEFAULT_REGION))
        p.add_argument("--profile", default=None, help="AWS CLI profile (default: AWS_PROFILE)")
        p.add_argument("--dry-run", action="store_true", help="show the plan, change nothing")

    p = common("transcode", "source file -> HLS + poster + manifest.json")
    p.add_argument("--source", type=Path, required=True, help="original film file")
    p.add_argument("--engine", choices=("docker", "local"), default="docker")
    p.add_argument("--image", default=FFMPEG_IMAGE, help="ffmpeg Docker image (pinned tag)")
    p.set_defaults(func=cmd_transcode)

    p = common("verify", "check an HLS output folder")
    p.set_defaults(func=cmd_verify)

    p = common("upload", "copy the HLS output to the media bucket")
    p.add_argument("--bucket", default=os.getenv("MEDIA_BUCKET"))
    aws(p)
    p.set_defaults(func=cmd_upload)

    p = common("register", "write the catalog item to DynamoDB")
    p.add_argument("--table", default=os.getenv("MAIN_TABLE_NAME"))
    p.add_argument("--app-domain", default=os.getenv("APP_DOMAIN"))
    aws(p)
    p.set_defaults(func=cmd_register)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        args.func(args)
    except PublishError as e:
        log(f"error: {e}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
