# Modul `rtc`: LiveKit di EC2

Pemilik: **RTC/Media**. Keputusan: [ADR-0004](../../../../docs/adr/0004-video-chat-livekit.md). Spesifikasi: [architecture.md §9.9](../../../../docs/architecture.md#99-ec2-livekit). Operasional: [runbook LiveKit](../../../../docs/runbooks/livekit.md).

## Isi

| Resource | Keterangan |
|---|---|
| EC2 Amazon Linux 2023 | Tipe dari `rtc_instance_type` (hanya tipe Free plan; divalidasi). IMDSv2 wajib, EBS gp3 terenkripsi, tanpa SSH, tanpa key pair. T3/T4g memakai credit `standard` agar tidak ada biaya mode `unlimited` |
| ENI + Elastic IP | ENI dibuat dulu dan EIP dipasang ke ENI, jadi instance sudah punya IP publik tetap saat boot pertama |
| Security group | 80/tcp (Let's Encrypt), 443/tcp (Caddy), 7881/tcp, 3478/udp, 50000–60000/udp. Tidak ada port 22 |
| Instance profile | `ssm:GetParameter` **hanya** untuk `livekit-api-key` dan `livekit-api-secret`, plus izin minimal Session Manager |
| Record DNS | `rtc.<app_domain>` dan `turn.<app_domain>` → EIP (jika `route53_zone_id` diisi) |
| EventBridge Scheduler | Start/stop terjadwal jika `rtc_schedule_enabled = true` |

## Cara kerja di instance

User data (boot pertama) memasang Docker lalu menulis `/opt/livekit/{livekit.yaml, caddy.yaml, fetch-keys.sh}` dan dua unit systemd:

- `livekit.service`: setiap start menjalankan `fetch-keys.sh` (ambil key/secret dari SSM → `/opt/livekit/keys.yaml`, mode 0600), lalu `docker run` LiveKit dengan `--network host`.
- `caddy.service`: Caddy layer4 di 443, routing berdasarkan SNI: `rtc.` → `localhost:7880` (WSS), `turn.` → `<private ip>:5349` (TURN/TLS, TLS diterminasi Caddy). Sertifikat Let's Encrypt disimpan di `/opt/livekit/caddy_data`.

Tata letak ini mengikuti hasil `livekit/generate` (deployment VM resmi LiveKit), dengan beda berikut:

- Tanpa docker-compose (dua unit systemd `docker run`), jadi tidak ada binary tambahan yang diunduh dari GitHub saat boot.
- Tanpa Redis (satu node).
- `node_ip` diisi EIP, jadi tidak perlu STUN publik saat start.
- Secret tidak ada di user data maupun `livekit.yaml`. LiveKit membaca `key_file`.

Image di-pin dengan tag **dan** digest (`livekit_image`, `caddy_image`; validasi menolak `latest`). Template sudah dites dengan image yang di-pin: LiveKit v1.13.11 start normal dengan `livekit.yaml` hasil render, dan `caddy validate` memberi "Valid configuration".

## Input penting

| Variabel | Default | Catatan |
|---|---|---|
| `subnet_id` | (wajib) | Subnet publik. Selama modul `network` belum ada, pakai subnet default VPC |
| `route53_zone_id` | `null` | Hosted zone `app_domain` |
| `rtc_instance_type` | `t3.small` | Fallback `c7i-flex.large` setelah load test (OQ-6) |
| `room_max_participants` | `10` | Sama dengan Lambda; LiveKit juga menolak peserta ke-11 |
| `rtc_schedule_enabled` | `false` | **Wajib `true`** jika memakai `c7i-flex.large` |
| `schedule_start_expression` / `schedule_stop_expression` | `cron(0 8 * * ? *)` / `cron(0 0 * * ? *)` | Zona `Asia/Jakarta`: hidup 08.00–24.00 WIB (16 jam/hari, sesuai skenario biaya A di architecture.md §11) |

Output: `instance_id`, `public_ip`, `livekit_url`, `rtc_domain`, `turn_domain`, `security_group_id`.

## Wiring di `envs/prod`

> Status: **sudah terpasang** di `envs/prod` sejak 2026-11-22 (wiring oleh Lead, menunggu review Platform + RTC/Media, belum di-apply). Contoh di bawah adalah bentuk yang dipakai.

```hcl
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default_public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

module "rtc" {
  source                = "../../modules/rtc"
  project_name          = var.project_name
  env                   = var.env
  aws_region            = var.aws_region
  app_domain            = var.app_domain
  subnet_id             = sort(data.aws_subnets.default_public.ids)[0] # ganti ke module.network saat sudah ada
  route53_zone_id       = var.route53_zone_id
  rtc_instance_type     = var.rtc_instance_type
  room_max_participants = var.room_max_participants
  rtc_schedule_enabled  = var.rtc_schedule_enabled
  tags                  = var.tags
}

# di module "api":
#   livekit_url = module.rtc.livekit_url
```

Syarat sebelum apply: parameter SSM `livekit-api-key` dan `livekit-api-secret` sudah ada (runbook bootstrap §7). Delegasi DNS sudah aktif, karena Caddy butuh `rtc.` dan `turn.` mengarah ke EIP untuk menerbitkan sertifikat.

## Cek setelah apply

```bash
dig +short rtc.watchparty.chescloud.my.id turn.watchparty.chescloud.my.id   # keduanya = EIP
curl -sS https://rtc.watchparty.chescloud.my.id/            # "OK" dari LiveKit (sertifikat valid)
openssl s_client -connect turn.watchparty.chescloud.my.id:443 \
  -servername turn.watchparty.chescloud.my.id </dev/null 2>/dev/null | grep -E 'subject=|Verify return'
```

Uji koneksi lengkap (UDP, TCP, TURN) dengan [LiveKit Connection Test](https://livekit.io/connection-test) memakai token dari `POST /rooms/{roomId}/rtc-token`. Langkah lengkap dan troubleshooting ada di runbook.

## Hal yang perlu diketahui

- **Ganti versi/konfigurasi = instance baru** (`user_data_replace_on_change`). EIP tetap, tetapi Caddy menerbitkan sertifikat baru. Let's Encrypt membatasi 5 sertifikat duplikat per minggu untuk nama yang sama, jadi jangan replace berkali-kali dalam seminggu.
- AMI baru tidak otomatis mengganti instance (`ignore_changes = [ami]`). Patch OS dilakukan dengan replace terencana.
- EIP tetap ditagih saat instance stop (±$3,7/bulan, architecture.md §11).
- Firefox menolak alamat loopback pada TURN/TLS, karena itu Caddy meneruskan ke IP privat, sama seperti script `update_ip.sh` dari `livekit/generate`.
