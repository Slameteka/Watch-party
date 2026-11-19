# Media: Pipeline HLS Katalog

Script offline untuk mengubah film Creative Commons menjadi HLS, mengunggahnya ke S3, dan mendaftarkannya di katalog DynamoDB. Desain: [architecture.md §5.4](../docs/architecture.md#54-pipeline-media), [ADR-0005](../docs/adr/0005-media-pipeline-content.md). Pemilik: RTC/Media.

## Isi Folder

| Path | Isi |
|---|---|
| `catalog.json` | Metadata film: judul, deskripsi, urutan, lisensi, atribusi, detik poster, URL sumber resmi + SHA-256 |
| `scripts/publish_media.py` | CLI 4 langkah: `transcode`, `verify`, `upload`, `register` |
| `tests/` | Unit test (pytest + moto, tanpa AWS sungguhan) |

File film, hasil HLS, dan kredensial **tidak boleh** masuk repo. Semua output ditulis ke folder di luar repo (`--out-dir`).

## Prasyarat

- Docker (ffmpeg dijalankan dari image yang di-pin, lihat bagian berikut).
- [uv](https://docs.astral.sh/uv/) dan Python 3.14.
- Untuk `upload` dan `register`: AWS CLI profile dengan sesi MFA dan policy `<project_name>-<env>-media-publisher` (output modul `edge`).

```bash
cd media
uv sync
uv run python scripts/publish_media.py --help
```

### Kenapa ffmpeg lewat Docker

Paket `ffmpeg-free` di Fedora tidak punya encoder `libx264` (alasan paten), dan versi ffmpeg berbeda di tiap laptop. Script memakai image `linuxserver/ffmpeg:9.0.2-cli-ls89` (ffmpeg 9.0.2, libx264) secara default, sehingga hasil transcode sama di semua laptop anggota. Ganti versi = PR yang mengubah konstanta `FFMPEG_IMAGE`. Opsi `--engine local` memakai ffmpeg di PATH, tetapi script menolak jika `libx264` tidak ada.

## Alur

```bash
OUT="$HOME/watchparty-media/hls"    # di luar repo
SRC="$HOME/watchparty-media/source"

# 1. Transcode: cek SHA-256 sumber, buat HLS + poster + manifest.json, lalu verifikasi otomatis
uv run python scripts/publish_media.py transcode sintel --source "$SRC/Sintel.2010.1080p.mkv" --out-dir "$OUT"

# 2. (Opsional) verifikasi ulang
uv run python scripts/publish_media.py verify sintel --out-dir "$OUT"

# 3. Upload ke media bucket (nama dari output Terraform modul edge: media_bucket_name)
export AWS_PROFILE=<profile-mfa> MEDIA_BUCKET=<media_bucket_name>
uv run python scripts/publish_media.py upload sintel --out-dir "$OUT" --dry-run
uv run python scripts/publish_media.py upload sintel --out-dir "$OUT"

# 4. Daftarkan item katalog
export MAIN_TABLE_NAME=<project_name>-<env>-main APP_DOMAIN=<project_name>.chescloud.my.id
uv run python scripts/publish_media.py register sintel --out-dir "$OUT" --dry-run
uv run python scripts/publish_media.py register sintel --out-dir "$OUT"
```

## Opsi ffmpeg dan Alasannya

| Opsi | Nilai | Alasan |
|---|---|---|
| Ladder | 360p 640 px / 480p 854 px / 720p 1280 px / 1080p 1920 px, video ~800 / 1.400 / 2.800 / 5.000 kbps | architecture.md §5.4. Rendition yang lebih lebar dari sumber tidak dibuat (tanpa upscale) |
| `scale=<lebar>:-2,setsar=1` | Lebar tetap, tinggi mengikuti sumber | Sintel (1920×818) dan Tears of Steel (1920×800) lebih lebar dari 16:9. Tinggi dibulatkan genap, tanpa letterbox |
| `-maxrate` / `-bufsize` | 1,07× / 1,5× bitrate target | Puncak bitrate terbatas, sehingga ABR bisa memprediksi kebutuhan bandwidth |
| `libx264 -preset medium -profile:v high -pix_fmt yuv420p` | H.264 | Didukung hls.js (MSE) dan Safari |
| `-force_key_frames expr:gte(t,n_forced*2)` + `-sc_threshold 0` | Keyframe tepat setiap 2 s, tanpa keyframe scene-cut | Keyframe sejajar di semua rendition, sehingga pindah kualitas dan seek mulus |
| `-c:a aac -b:a 128k -ac 2 -ar 48000` | AAC stereo | Sumber 5.1 (BBB, Sintel) di-downmix ke stereo untuk browser |
| `-f hls -hls_time 4 -hls_segment_type fmp4 -hls_playlist_type vod -hls_flags independent_segments` | Segmen fMP4 4 s | architecture.md §5.4 |
| Poster | 1 frame di `posterAtSec`, lebar 640 px, JPEG | `posters/<mediaId>.jpg` publik di `/posters/*` |

Upload memasang `Content-Type` per ekstensi (`.m3u8` `application/vnd.apple.mpegurl`, `.mp4` `video/mp4`, `.m4s` `video/iso.segment`, `.jpg` `image/jpeg`) dan `Cache-Control: public, max-age=31536000, immutable`. File lain ditolak. `master.m3u8` diunggah paling akhir, jadi upload yang terputus tidak pernah menghasilkan film setengah jadi yang bisa diputar.

## Item Katalog

`register` menulis item ke tabel `main` (architecture.md §7.2):

| Atribut | Contoh |
|---|---|
| `PK` / `SK` | `CATALOG` / `MEDIA#sintel` |
| `mediaId`, `title`, `description`, `sortOrder`, `license`, `attribution` | Dari `catalog.json` |
| `durationSec` | Dari playlist hasil transcode (bukan diketik manual) |
| `posterPath` / `playbackPath` | `/posters/sintel.jpg` / `/media/sintel/master.m3u8` |
| `posterUrl` / `playbackUrl` | URL lengkap dengan `APP_DOMAIN`. **Sementara** untuk kompatibilitas karena `RoomRepository` di backend masih membaca URL lengkap. Dihapus setelah backend membangun URL dari `*Path` |

## Lisensi Film

| Film | Lisensi | Atribusi | Sumber |
|---|---|---|---|
| Big Buck Bunny | CC BY 3.0 | (c) copyright 2008, Blender Foundation / www.bigbuckbunny.org | [peach.blender.org](https://peach.blender.org/about/) |
| Sintel | CC BY 3.0 | © copyright Blender Foundation \| durian.blender.org | [durian.blender.org/sharing](https://durian.blender.org/sharing/) |
| Tears of Steel | CC BY 3.0 | (CC) Blender Foundation \| mango.blender.org | [mango.blender.org/sharing](https://mango.blender.org/sharing/) |

Logo (Blender, logo proyek, Creative Commons) tidak termasuk lisensi CC. **Sintel:** jika film diputar, seluruh credit scroll wajib disertakan, jadi film tidak boleh dipotong. **Tears of Steel:** file soundtrack terpisah (OST) berlisensi CC BY-ND 3.0 (`download.blender.org/demo/movies/ToS/copyright.txt`). Kita memakai film utuh, bukan file OST.

## Menambah Film

1. Pastikan lisensinya Creative Commons yang mengizinkan distribusi (C-7). Catat sumber dan atribusinya.
2. Tambah item di `catalog.json` (`mediaId` huruf kecil `^[a-z0-9-]{1,64}$`, `sortOrder` unik, `source.sha256` dari `sha256sum`).
3. Jalankan alur di atas. Film yang diganti memakai `mediaId` baru, karena objek di-cache `immutable` selama 1 tahun.

## Waktu dan Ukuran

Diukur di laptop RTC/Media (8 core, CPU tertahan ±1,2 GHz saat beban penuh): Big Buck Bunny (596 s) butuh ±26 menit dan menghasilkan 733 MB. Kecepatan transcode sekitar 0,2–0,4× real-time, jadi siapkan waktu 40–75 menit per film. Estimasi total 3 film ±2,7 GB di S3.

## Test

```bash
cd media
uv run ruff format --check && uv run ruff check && uv run pytest
```

Test memakai kredensial palsu (`tests/conftest.py`) dan moto, jadi tidak pernah menyentuh akun AWS.
