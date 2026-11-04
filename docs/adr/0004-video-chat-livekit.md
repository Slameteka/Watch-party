# ADR-0004: Video Chat dengan LiveKit Self-Hosted

| Atribut | Nilai |
|---|---|
| Status | Proposed |
| Tanggal | 2026-10-31 |
| Pemilik | RTC/Media (UI: FE-Social) |
| Terkait | F-3.1–F-3.5; NFR-1.5, NFR-1.6, NFR-2.3; R-5, R-6; ADR-0001 |

## Konteks

- Draft v0 memakai Amazon Chime SDK dan menyebut audio/video "langsung peer-to-peer via Chime". Itu salah: Chime SDK memakai media server (SFU), bukan peer-to-peer.
- Akun AWS yang dibuat lewat alur "Sign up for AWS (new)" tidak bisa memakai Chime SDK. Kita memakai signup advanced (ADR-0001), tetapi tetap ingin biaya yang bisa diprediksi.
- Room maksimal 10 peserta dengan kamera aktif. Angka ini adalah batas platform dari konfigurasi (`room_max_participants`, [architecture.md §3.2](../architecture.md#32-parameter-aplikasi)), dipilih karena beban SFU (≈ n × (n − 1) stream) dan biaya egress. Mesh peer-to-peer untuk 10 orang terlalu berat bagi browser (setiap peserta mengirim 9 stream).
- Free plan membatasi instance type EC2: t3.micro, t3.small, t4g.micro, t4g.small, c7i-flex.large, m7i-flex.large.
- WebRTC butuh port UDP terbuka, TURN untuk jaringan yang memblokir UDP, dan sertifikat TLS valid (self-signed ditolak browser).

## Keputusan

1. Memakai **LiveKit OSS** (SFU, self-hosted, Docker) di **satu EC2** di public subnet dengan **Elastic IP**, **TURN embedded**, dan port UDP dibuka di security group.
2. **TLS valid** dari Let's Encrypt lewat Caddy di EC2 untuk `rtc.<project_name>.chescloud.my.id` (signaling) dan `turn.<project_name>.chescloud.my.id` (TURN/TLS di port 443, routing SNI). Record DNS keduanya mengarah ke Elastic IP yang sama.
3. **Access token** LiveKit dibuat oleh Lambda `rest-api` dengan LiveKit Python server SDK (`POST /rooms/{roomId}/rtc-token`), TTL 10 menit, `identity = participantId`, `room = roomId`.
4. **Instance type adalah variabel** `rtc_instance_type`: default `t3.small`, fallback `c7i-flex.large`. Pilihan final setelah **load test 10 peserta** (M3, Sab 7 Nov 2026).
5. Opsional: **stop terjadwal** di luar jam kerja (EventBridge Scheduler). Wajib aktif jika memakai `c7i-flex.large`.
6. **Graceful degradation:** jika LiveKit mati, film, sync, chat, dan reaction tetap jalan.
7. Akses shell lewat SSM Session Manager (port 22 tertutup).

## Alternatif yang Dipertimbangkan

| Alternatif | Kelebihan | Kekurangan | Alasan ditolak |
|---|---|---|---|
| Amazon Chime SDK | Fully managed, SFU | Tidak tersedia untuk akun dari alur "Sign up for AWS (new)"; biaya per menit peserta sulit diprediksi; lebih sedikit infra untuk didemonstrasikan | LiveKit lebih portable dan biaya tetap |
| LiveKit Cloud | Tanpa server | Bukan infra sendiri; akun pihak ketiga | Tujuan mata kuliah adalah membangun infra cloud |
| Mesh WebRTC peer-to-peer | Tanpa server media | 10 peserta = 9 upload per browser; tidak stabil | Tidak memenuhi NFR-1.5 |
| Jitsi / mediasoup self-hosted | Open source | Setup lebih berat (Jitsi) atau butuh banyak kode server (mediasoup) | LiveKit punya SDK client + server Python yang siap pakai |
| EC2 di belakang NLB/ALB | Bisa scale | Biaya tetap load balancer | Satu instance cukup untuk 1 room demo |

## Konsekuensi

- **Positif:** biaya tetap dan bisa diprediksi; portable (bisa pindah ke VM lain); mendemonstrasikan EC2, security group, Elastic IP, TLS, dan DNS.
- **Negatif / trade-off:**
  - Single point of failure untuk video chat (diterima, dengan graceful degradation).
  - Tim mengelola patch OS dan versi LiveKit sendiri.
  - Egress video adalah komponen biaya variabel terbesar (lihat [architecture.md §11](../architecture.md#11-estimasi-biaya)).
  - Butuh hostname tambahan `turn.` agar TURN/TLS bisa di port 443 bersama signaling.
- **Tindak lanjut:** load test 10 peserta; pin versi image LiveKit; atur simulcast dan resolusi kamera 640×360 di client.

## Verifikasi

| Klaim | Status | Sumber |
|---|---|---|
| Port LiveKit: 7880 API/WS (di belakang TLS), 50000–60000 UDP, 7881 TCP, 3478 UDP TURN, 5349/443 TURN/TLS (443 jika tanpa load balancer) | verified (sumber pihak ketiga) | [LiveKit ports and firewall](https://docs.livekit.io/home/self-hosting/ports-firewall/) |
| Chime SDK adalah SFU, bukan peer-to-peer | prior knowledge, unverified | [Amazon Chime SDK docs](https://docs.aws.amazon.com/chime-sdk/) |
| Akun dari alur "Sign up for AWS (new)" tidak bisa memakai Chime SDK | verified (AWS docs) | [Supported AWS services for Sign up for AWS (new)](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html) |
| Instance type EC2 eligible Free plan | verified (AWS docs) | [EC2 Free Tier usage](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html) |
| t3.small cukup untuk 10 peserta | prior knowledge, unverified | Diputuskan lewat load test M3 (NFR-1.5, OQ-6) |
| Instance type yang dipilih bisa diluncurkan di akun Free plan | perlu dicek hari 1 | Runbook cek D5 |
| Harga t3.small `ap-southeast-1` ≈ $0,0264/jam | verified (sumber pihak ketiga) | [doit.com t3.small ap-southeast-1](https://www.doit.com/compute/compute/aws/ap-southeast-1/t3.small) |
