# ADR-0005: Pipeline Media & Konten

| Atribut | Nilai |
|---|---|
| Status | Proposed |
| Tanggal | 2026-10-31 |
| Pemilik | RTC/Media (CloudFront & bucket: Platform) |
| Terkait | F-2.3, F-2.6, F-5.1; NFR-1.3, NFR-1.8, NFR-3.3; C-7; R-12 |

## Konteks

- Draft v0 punya pertanyaan terbuka soal hak cipta dan sumber film (sendiri atau YouTube embed).
- Draft v0 memakai **signed URL** untuk video di S3. HLS terdiri dari satu master playlist, beberapa playlist rendition, dan **ratusan segmen** per film. Signed URL berarti setiap playlist harus ditulis ulang dengan URL bertanda tangan per segmen, dan URL yang berbeda per user membuat cache key berbeda sehingga cache CloudFront tidak efisien.
- Akun dari alur "Sign up for AWS (new)" tidak bisa memakai MediaConvert. Katalog kita kecil (3 film) dan tidak berubah selama proyek.
- Target cache hit ratio > 90% dan join-to-first-frame < 3 s.

## Keputusan

1. **Konten:** katalog **curated** yang hanya dikelola admin tim, berisi film **Creative Commons** (Blender open movies: *Big Buck Bunny*, *Sintel*, *Tears of Steel*) dengan atribusi di katalog. **Tidak ada upload dari pengguna.** Ini menjawab pertanyaan hak cipta.
2. **Transcoding offline** dengan ffmpeg lewat script di repo (`media/scripts/publish_media.py`): HLS dengan ladder ABR **360p / 480p / 720p / 1080p**, lalu upload ke S3 dan daftarkan item katalog di DynamoDB. **MediaConvert tidak dipakai.**
3. **Delivery:** S3 media bucket privat di belakang CloudFront path `/media/*` dengan OAC, dilindungi **CloudFront signed cookies** (bukan signed URLs). Poster di `/posters/*` publik.
4. Cookie diterbitkan oleh `POST /rooms/{roomId}/media-cookies` dengan custom policy yang hanya mengizinkan `/media/<mediaId>/*` milik room tersebut selama 2 jam.
5. Player memakai **hls.js** (dibutuhkan untuk kontrol `playbackRate` yang halus dan event yang konsisten); ABR otomatis sebagai default, pilihan kualitas manual adalah fitur Should (F-2.6).
6. **YouTube embed ditolak.**

## Alternatif yang Dipertimbangkan

| Alternatif | Kelebihan | Kekurangan | Alasan ditolak |
|---|---|---|---|
| CloudFront signed URLs | Granular per file | Ratusan segmen; playlist harus ditulis ulang; cache key per user | Tidak efisien untuk HLS |
| AWS Elemental MediaConvert | Managed, kualitas tinggi | Tidak tersedia untuk akun dari alur "Sign up for AWS (new)"; biaya per menit | Katalog kecil, ffmpeg cukup |
| YouTube embed | Konten banyak, tanpa biaya bandwidth | Kontrol sync terbatas, iklan, ToS, tidak mendemonstrasikan infra | Tidak memenuhi G1 dan tujuan mata kuliah |
| Upload film oleh pengguna | Fleksibel | Risiko hak cipta, butuh pipeline transcoding online | Won't v1 |
| File MP4 tunggal (progressive) | Sangat sederhana | Tanpa ABR; seek dan buffering lebih buruk | Tidak memenuhi F-2.3 |
| Bucket S3 publik | Paling sederhana | Siapa pun bisa mengunduh film | Tidak memenuhi NFR-3.3 |

## Konsekuensi

- **Positif:** tidak ada risiko hak cipta; biaya transcoding $0; cache CloudFront efisien karena URL sama untuk semua peserta; satu cookie untuk semua segmen.
- **Negatif / trade-off:**
  - Menambah film butuh admin menjalankan script secara manual.
  - Cookie diset dari `api.` untuk domain parent, sehingga SPA wajib memanggil endpoint dengan `credentials: "include"` dan CORS harus `allowCredentials: true` dengan origin yang tepat.
  - CloudFront custom error response tidak boleh dipakai untuk SPA routing (akan mengubah 403 `/media/*` menjadi HTML); dipakai CloudFront Function di default behavior.
- **Tindak lanjut:** warm-up cache sebelum demo; cache key `/media/*` tanpa cookie/header/query string.

## Verifikasi

| Klaim | Status | Sumber |
|---|---|---|
| CloudFront signed cookies cocok untuk banyak file terbatas | verified (AWS docs) | [Choosing between signed URLs and signed cookies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-choosing-signed-urls-cookies.html) |
| Signed cookies memakai `CloudFront-Policy`, `CloudFront-Signature`, `CloudFront-Key-Pair-Id` | verified (AWS docs) | [Using signed cookies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-cookies.html) |
| Akun dari alur "Sign up for AWS (new)" tidak bisa memakai MediaConvert | verified (AWS docs) | [Supported AWS services for Sign up for AWS (new)](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html) |
| Film Blender berlisensi Creative Commons | prior knowledge, unverified | [Blender Studio films](https://studio.blender.org/films/); cek lisensi tiap film saat mengunduh |
| hls.js mendukung Safari iPadOS lewat ManagedMediaSource | prior knowledge, unverified | — |
