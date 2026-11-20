# Runbook: LiveKit (video chat)

Pemilik: **RTC/Media**. Infrastruktur: [modul `rtc`](../../infra/terraform/modules/rtc/README.md). Keputusan: [ADR-0004](../adr/0004-video-chat-livekit.md).

Contoh di bawah memakai `PROJECT_NAME=watchparty`, `ENV_NAME=prod`, `AWS_REGION=ap-southeast-1`, dan domain `watchparty.chescloud.my.id`.

## 1. Prasyarat sebelum apply

- [ ] Parameter SSM `/watchparty/prod/livekit-api-key` dan `/watchparty/prod/livekit-api-secret` sudah ada ([bootstrap.md §7](bootstrap.md#7-secret-di-ssm-parameter-store)).
- [ ] Delegasi DNS `watchparty.chescloud.my.id` aktif (`dig NS` menampilkan NS Route 53).
- [ ] `module "rtc"` sudah di-wiring di `envs/prod`, dan `module "api"` memakai `livekit_url = module.rtc.livekit_url`.
- [ ] Untuk akses shell: role kamu punya `ssm:StartSession` ke instance ini, dan [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) terpasang di laptop.

## 2. Cek setelah apply (±5 menit setelah instance running)

```bash
IID=$(terraform -chdir=infra/terraform/envs/prod output -raw rtc_instance_id)   # jika output diteruskan di root
dig +short rtc.watchparty.chescloud.my.id turn.watchparty.chescloud.my.id      # keduanya = EIP
curl -sS https://rtc.watchparty.chescloud.my.id/                               # "OK", sertifikat valid
openssl s_client -connect turn.watchparty.chescloud.my.id:443 \
  -servername turn.watchparty.chescloud.my.id </dev/null 2>/dev/null | grep -E 'subject=|Verify return'
```

Lalu uji dari browser:

1. Buat room di aplikasi, ambil token dari `POST /rooms/{roomId}/rtc-token` (DevTools → Network).
2. Buka [LiveKit Connection Test](https://livekit.io/connection-test), isi URL `wss://rtc.watchparty.chescloud.my.id` dan token itu.
3. Semua cek harus hijau, termasuk "TURN" dan "TCP". Ulangi sekali dari jaringan yang memblokir UDP (hotspot kampus/kantor) untuk risiko R-6.

## 3. Akses shell dan log

```bash
aws ssm start-session --region ap-southeast-1 --target "$IID"
# di instance:
sudo systemctl status livekit caddy
sudo journalctl -u livekit -u caddy --since "30 min ago"
sudo docker logs --tail 100 caddy | grep -E 'certificate obtained|error'
```

Jangan menampilkan `/opt/livekit/keys.yaml` di layar saat sesi bersama.

## 4. Start dan stop

- Terjadwal: `rtc_schedule_enabled = true` (default 08.00–24.00 WIB). Wajib jika memakai `c7i-flex.large`.
- Manual (misalnya sebelum demo di luar jadwal):

```bash
aws ec2 start-instances --region ap-southeast-1 --instance-ids "$IID"
aws ec2 wait instance-status-ok --region ap-southeast-1 --instance-ids "$IID"
aws ec2 stop-instances  --region ap-southeast-1 --instance-ids "$IID"
```

Setelah start, unit systemd jalan otomatis dan sertifikat lama dipakai lagi. EIP tetap sama.

## 5. Rotasi API key/secret LiveKit

Lambda `rest-api` dan LiveKit harus memakai pasangan yang sama. Token lama gagal setelah rotasi, jadi lakukan saat tidak ada sesi.

```bash
WORKDIR="$(mktemp -d)"; cd "$WORKDIR"
printf 'API%s' "$(openssl rand -hex 8)" > livekit-api-key
openssl rand -base64 48 | tr -d '\n' > livekit-api-secret
aws ssm put-parameter --region ap-southeast-1 --type SecureString --overwrite \
  --name /watchparty/prod/livekit-api-key --value file://livekit-api-key
aws ssm put-parameter --region ap-southeast-1 --type SecureString --overwrite \
  --name /watchparty/prod/livekit-api-secret --value file://livekit-api-secret
cd - && rm -rf "$WORKDIR"
```

1. Di instance: `sudo systemctl restart livekit` (membaca SSM ulang).
2. Lambda menyimpan secret di cache per execution environment. Paksa environment baru dengan deploy ulang `rest-api` lewat CI (atau ubah konfigurasi function lewat PR Terraform).
3. Cek: buka room dan nyalakan kamera.

## 6. Upgrade versi LiveKit atau Caddy

1. Cari tag stabil terbaru di [Docker Hub livekit-server](https://hub.docker.com/r/livekit/livekit-server/tags) dan catat digest index multi-arch.
2. PR ke modul `rtc`: ubah default `livekit_image` (format `livekit/livekit-server:vX.Y.Z@sha256:...`). Baca release notes LiveKit untuk perubahan config.
3. Uji config lokal dengan image baru: render `templates/livekit.yaml.tftpl`, lalu `docker run` image itu dengan `--config` (lihat README modul).
4. `terraform plan` harus menampilkan **replace** `aws_instance.rtc` saja. Apply di luar jam pakai, lalu jalankan §2.

Setiap replace menerbitkan sertifikat baru. Batas Let's Encrypt: 5 sertifikat duplikat per minggu untuk nama yang sama.

## 7. Load test 10 peserta (NFR-1.5, OQ-6)

Jalankan dari laptop dengan [LiveKit CLI](https://docs.livekit.io/reference/developer-tools/livekit-cli/perf/) (`lk`). Key dan secret dibaca dari SSM ke variabel shell, tidak ditulis ke file:

```bash
export LIVEKIT_URL=wss://rtc.watchparty.chescloud.my.id
export LIVEKIT_API_KEY="$(aws ssm get-parameter --region ap-southeast-1 --with-decryption \
  --name /watchparty/prod/livekit-api-key --query Parameter.Value --output text)"
export LIVEKIT_API_SECRET="$(aws ssm get-parameter --region ap-southeast-1 --with-decryption \
  --name /watchparty/prod/livekit-api-secret --query Parameter.Value --output text)"
lk perf load-test --room loadtest-10 --video-publishers 8 --audio-publishers 8 \
  --subscribers 2 --video-resolution medium --layout 3x3 --duration 5m
unset LIVEKIT_API_KEY LIVEKIT_API_SECRET
```

- Selama test, tambah 2–3 browser nyata ke room aplikasi.
- Pantau CPU dan `CPUCreditBalance` instance di CloudWatch.
- Catat hasil (CPU puncak, packet loss, kualitas di browser) di PROGRESS dan ADR-0004.
- Keputusan: CPU stabil < 80% → tetap `t3.small`. Di atas itu → `c7i-flex.large` dengan stop terjadwal.

Load test memakai egress (biaya variabel terbesar), jadi batasi durasinya.

## 8. Troubleshooting

| Gejala | Penyebab umum | Cek / perbaikan |
|---|---|---|
| `curl https://rtc.` error sertifikat | DNS belum ke EIP, atau port 80 tertutup saat challenge | `dig`; log Caddy (`docker logs caddy`); restart `caddy` setelah DNS benar |
| Video tidak tersambung di jaringan tertentu | UDP diblokir | Connection Test: TCP 7881 atau TURN/TLS 443 harus hijau |
| `rtc-token` 500 | Parameter SSM LiveKit belum ada atau Lambda tidak boleh membacanya | Log `rest-api` ("Failed to read SSM parameter"); cek nama parameter |
| Join video gagal "invalid token" | Key Lambda dan LiveKit berbeda (setelah rotasi) | Ikuti §5 langkah 1–2 |
| LiveKit restart terus | Config salah atau `keys.yaml` kosong | `journalctl -u livekit`; jalankan `sudo /opt/livekit/fetch-keys.sh` |
| Peserta ke-11 ditolak | Batas `room_max_participants` | Sesuai desain (architecture.md §3.2) |

## 9. Darurat saat demo

1. Film, sync, chat, dan reaction tidak bergantung pada LiveKit (graceful degradation). Lanjutkan demo tanpa video chat jika perlu.
2. Coba `sudo systemctl restart livekit caddy` lewat Session Manager (< 1 menit).
3. Jika instance rusak: `terraform apply -replace=module.rtc.aws_instance.rtc` (±5 menit sampai sertifikat terbit).

## 10. Pengembangan lokal

Server lokal backend (`backend/local_server.py`) sudah memakai key bawaan mode dev LiveKit. Jalankan LiveKit dev di laptop:

```bash
docker run --rm --name livekit-dev -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  livekit/livekit-server:v1.13.11 --dev --bind 0.0.0.0
```

Key dev (`devkey` / `secret`) bersifat publik dan **hanya** untuk laptop.
