# ADR-0006: DNS & Domain

| Atribut | Nilai |
|---|---|
| Status | Proposed |
| Tanggal | 2026-10-31 |
| Pemilik | Platform |
| Terkait | F-6.1; NFR-3.1; C-8; R-8; ADR-0002, ADR-0004 |

## Konteks

- Penulis draft PRD memiliki domain `chescloud.my.id` dengan nameserver di **Cloudflare** (dipakai juga untuk Cloudflare Tunnel di proyek lain). Domain akan dipakai proyek lain lewat subdomain, jadi proyek ini hanya boleh memakai **satu subdomain**.
- Nama produk belum fix, jadi subdomain diturunkan dari `project_name`: `<project_name>.chescloud.my.id` (contoh `watchparty.chescloud.my.id`).
- CloudFront dan API Gateway custom domain butuh sertifikat ACM. Sertifikat CloudFront wajib di `us-east-1`; sertifikat API Gateway regional di `ap-southeast-1`.
- Kita ingin semua record dan validasi sertifikat dikelola Terraform dengan provider AWS saja.

## Keputusan

1. **Delegasi subdomain** `<project_name>.chescloud.my.id` ke **Route 53 public hosted zone** lewat **record NS** yang dibuat **sekali secara manual di Cloudflare** oleh pemilik domain (langkah di [runbooks/bootstrap.md](../runbooks/bootstrap.md)).
2. Record di hosted zone (dikelola Terraform):

| Record | Tipe | Target |
|---|---|---|
| `<project_name>.chescloud.my.id` (apex subdomain) | A/AAAA alias | CloudFront (web app + `/media/*` + `/posters/*`) |
| `api.<project_name>.chescloud.my.id` | A alias | HTTP API custom domain |
| `ws.<project_name>.chescloud.my.id` | A alias | WebSocket API custom domain |
| `rtc.<project_name>.chescloud.my.id` | A | Elastic IP LiveKit |
| `turn.<project_name>.chescloud.my.id` | A | Elastic IP LiveKit (sama), untuk TURN/TLS di port 443 (ADR-0004) |

3. **ACM:** sertifikat untuk CloudFront di `us-east-1` (`<project_name>.chescloud.my.id`); sertifikat regional di `ap-southeast-1` untuk `api.` dan `ws.`. Validasi DNS lewat Route 53. Sertifikat `rtc.`/`turn.` dari Let's Encrypt di EC2 (sertifikat ACM tidak dipasang langsung di EC2).
4. Record di Cloudflare untuk subdomain ini **hanya NS** (tanpa proxy Cloudflare).

## Alternatif yang Dipertimbangkan

| Alternatif | Kelebihan | Kekurangan | Alasan ditolak |
|---|---|---|---|
| Semua record di Cloudflare (CNAME ke CloudFront/API Gateway) | Tanpa biaya hosted zone | Butuh provider Cloudflare + API token pemilik domain di Terraform; tidak ada alias record; validasi ACM manual atau lewat provider kedua | Menambah secret dan dependency ke pemilik domain |
| Cloudflare proxy (orange cloud) di depan CloudFront | CDN/WAF Cloudflare | Dua CDN bertumpuk; masalah signed cookies, TLS, dan WebSocket; bukan infra AWS | Kompleks dan membingungkan |
| Domain baru di Route 53 | Semua di AWS | Biaya domain; pendaftaran domain mungkin tidak tersedia di Free plan | Domain sudah ada |
| Default domain (`*.cloudfront.net`, `*.execute-api...`) | Tanpa setup DNS | Tidak memenuhi F-6.1; cookie tidak bisa dibagi antar domain | Tidak memenuhi requirement |

## Konsekuensi

- **Positif:** semua record dan sertifikat dikelola Terraform dengan provider AWS; pemilik domain hanya perlu membuat NS record sekali; proyek lain di domain yang sama tidak terganggu.
- **Negatif / trade-off:**
  - Hosted zone ±$0,50/bulan.
  - Jika hosted zone dihapus dan dibuat ulang, nameserver berubah dan record NS di Cloudflare harus diperbarui. Karena itu hosted zone diberi `prevent_destroy` dan nameserver-nya dicatat di runbook.
  - Subdomain baru bisa dibuat hanya setelah `project_name` fix (Senin 2 Nov 2026).
- **Tindak lanjut:** cek propagasi delegasi dengan `dig NS <project_name>.chescloud.my.id`; cek sertifikat `us-east-1` di hari 1.

## Verifikasi

| Klaim | Status | Sumber |
|---|---|---|
| Subdomain bisa didelegasikan ke Route 53 dengan record NS di DNS provider parent | verified (AWS docs) | [Routing traffic for subdomains](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-routing-traffic-for-subdomains.html) |
| Sertifikat CloudFront wajib di `us-east-1` | verified (AWS docs) | [CloudFront SSL/TLS requirements](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html) |
| ACM di `us-east-1` bisa dipakai di akun Free plan | **perlu dicek hari 1** | — |
| Harga hosted zone ±$0,50/bulan | prior knowledge, unverified | — |
