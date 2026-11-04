# Runbook: Bootstrap Akun & Fondasi (Satu Kali)

> Nama produk masih nama kerja; difiksasi Senin 2 Nov 2026. Jalankan runbook ini **setelah** `project_name` difiksasi, karena nama bucket state, parameter SSM, dan subdomain bergantung padanya.

| Atribut | Nilai |
|---|---|
| Pemilik | Platform (TBD) |
| Kapan | Senin, 2 Nov 2026 (M0) |
| Butuh | Pemilik akun AWS (Platform), pemilik domain `chescloud.my.id` (untuk langkah Cloudflare), Product & Tech Lead (approve) |
| Hasil dicatat di | [PROGRESS.md](../PROGRESS.md) entri 2 Nov 2026 |

Ini adalah **satu-satunya ClickOps yang diizinkan**. Semua resource lain dibuat dengan Terraform. Setiap langkah yang dikerjakan diberi centang dan dicatat (siapa, kapan, hasil).

**Aturan keras selama bootstrap:**
- Jangan bergabung ke AWS Organizations, jangan pasang Control Tower, jangan aktifkan IAM Identity Center. Ketiganya otomatis meng-upgrade Free plan ke Paid plan ([ADR-0001](../adr/0001-aws-account-free-plan.md)).
- Jangan pilih Paid plan. Jika opsi Free plan tidak ada, **berhenti** dan pakai fallback di [§1](#1-signup-akun-aws).
- Jangan menulis secret ke file di dalam repo, ke chat tim, atau ke shell history.

---

## 0. Persiapan

- [ ] Nama produk dan `project_name` sudah fix. Tulis di sini: `project_name = ________`.
- [ ] Pemilik akun (role Platform) sudah ditentukan.
- [ ] Email untuk root user: email yang aktif dan bisa diakses pemilik akun (disarankan alias khusus proyek).
- [ ] Metode pembayaran untuk verifikasi signup tersedia (AWS biasanya tetap meminta kartu saat signup, **prior knowledge, unverified**). Free plan tidak menagih.
- [ ] Tools terpasang di laptop Platform: AWS CLI v2, Terraform `>= 1.17`, `openssl`, `dig`.

Set variabel shell yang dipakai di langkah berikut:

```bash
export PROJECT_NAME="watchparty"          # ganti dengan project_name final
export ENV_NAME="prod"
export AWS_REGION="ap-southeast-1"
```

## 1. Signup Akun AWS

1. Buka halaman signup AWS dan pilih **"Sign up for AWS (advanced)"**. **Jangan** pakai alur "Sign up for AWS (new)", karena akun dari alur itu dikunci ke region per negara (Indonesia → `ap-southeast-2`) dan tidak bisa memakai beberapa service.
2. Saat memilih plan, pilih **Free plan**.
3. Selesaikan verifikasi telepon dan pembayaran.
4. Setelah login, buka **Billing and Cost Management → Account plan / Credits** dan catat:
   - [ ] Plan = Free plan
   - [ ] Credits awal (harusnya $100)
   - [ ] Tanggal berakhir Free plan (6 bulan dari signup)

**Fallback jika opsi Free plan tidak muncul di alur advanced:** batalkan signup, jangan pilih Paid plan. Laporkan ke Product & Tech Lead. Pakai akun AWS milik penulis draft PRD sebagai cadangan: cek dulu bahwa akun itu Free plan, tidak tergabung di Organizations, dan cek sisa credits-nya. Catat keputusan di PROGRESS.md dan perbarui ADR-0001 (lewat PR).

## 2. Amankan Root User

- [ ] Aktifkan MFA untuk root user (authenticator app atau security key).
- [ ] Pastikan **tidak ada access key** untuk root.
- [ ] Isi alternate contacts (billing, operations, security) dengan email pemilik akun dan Product & Tech Lead.
- [ ] Setelah langkah 3 dan 4 selesai, root tidak dipakai lagi untuk kerja harian.

## 3. Budget & Pemantauan Credits

Budget dibuat manual di sini karena proteksi biaya harus ada **sebelum** Terraform pertama kali dijalankan. Setelah fondasi Terraform siap, budget di-import ke modul `observability`.

1. Buka **AWS Budgets → Create budget → Cost budget**.
2. Nama: `<project_name>-monthly-budget`. Periode: monthly. Jumlah: **$50** (sama dengan default `monthly_budget_usd`).
3. Di opsi lanjutan, pastikan **credits tidak dihitung sebagai pengurang** biaya, agar alert mencerminkan pemakaian credits. (**Perlu dicek hari 1:** nama opsi persisnya di console.)
4. Buat alert untuk **actual cost** di **25%, 50%, 75%, 90%** ke email pemilik akun + Product & Tech Lead (+ anggota lain jika mau).
5. Konfirmasi email subscription jika diminta.

- [ ] Budget dibuat dengan 4 alert
- [ ] Credits tidak mengurangi angka budget
- [ ] Email alert diterima (test: tunggu notifikasi pertama atau cek status "OK" di console)

Pemantauan rutin: setiap Senin, pemilik akun mencatat sisa credits dan biaya bulan berjalan di PROGRESS.md.

## 4. IAM: Grup, User, MFA

1. Buat grup:
   - `admins`: policy `AdministratorAccess` + policy wajib MFA (di bawah). Untuk Platform dan Product & Tech Lead.
   - `developers`: `ReadOnlyAccess` + policy wajib MFA. Hak tambahan spesifik (upload media, Session Manager) ditambahkan lewat Terraform nanti.
2. Buat policy wajib MFA (`<project_name>-require-mfa`): deny semua aksi kecuali mengelola MFA milik sendiri jika `aws:MultiFactorAuthPresent` bernilai false. Pakai contoh resmi AWS "allows MFA-authenticated IAM users to manage their own credentials" sebagai dasar.
3. Buat satu IAM user per anggota (nama: `firstname` huruf kecil, bahasa Inggris/ASCII), akses console, password sementara + wajib ganti saat login pertama.
4. Setiap anggota login, mengaktifkan MFA, lalu logout dan login lagi dengan MFA.
5. Access key CLI hanya untuk yang butuh (Platform, RTC/Media, Backend), dan selalu dipakai lewat sesi MFA:

```bash
# Contoh pemakaian sesi MFA (ganti ARN device MFA dan kode OTP)
aws sts get-session-token \
  --serial-number "arn:aws:iam::<account_id>:mfa/<device_name>" \
  --token-code 123456 \
  --duration-seconds 43200
```

- [ ] Grup `admins` dan `developers` dibuat
- [ ] Semua anggota login console dengan MFA (**cek hari 1**)

> Kenapa IAM user, bukan IAM Identity Center? Identity Center butuh AWS Organizations, dan Organizations otomatis meng-upgrade Free plan ke Paid plan. Ini kompromi yang disengaja (ADR-0001).

## 5. Cek Kuota & Ketersediaan

```bash
# Instance type EC2 yang eligible Free plan di region ini
aws ec2 describe-instance-types \
  --region "$AWS_REGION" \
  --filters Name=free-tier-eligible,Values=true \
  --query "InstanceTypes[].InstanceType" --output text

# Kuota concurrent executions Lambda (kode kuota L-B99A9384)
aws service-quotas get-service-quota \
  --region "$AWS_REGION" \
  --service-code lambda --quota-code L-B99A9384 \
  --query "Quota.Value"
```

- [ ] `t3.small` dan `c7i-flex.large` ada di daftar eligible
- [ ] Kuota Lambda concurrency dicatat. Jika < 50, ajukan kenaikan lewat Service Quotas (gratis) dan catat nomor request-nya

(Filter `free-tier-eligible`: **verified (AWS docs)**, [EC2 Free Tier](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html). Kode kuota `L-B99A9384`: **prior knowledge, unverified**. Jika perintah gagal, cek lewat console EC2 launch wizard dan Service Quotas.)

## 6. Bucket Terraform State

Bucket dibuat sekali lewat CLI (bukan Terraform) agar tidak ada masalah "ayam dan telur".

```bash
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
STATE_BUCKET="${PROJECT_NAME}-tfstate-${ACCOUNT_ID}"

aws s3api create-bucket \
  --bucket "$STATE_BUCKET" \
  --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"

aws s3api put-bucket-versioning \
  --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket "$STATE_BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws s3api put-public-access-block \
  --bucket "$STATE_BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-tagging \
  --bucket "$STATE_BUCKET" \
  --tagging "TagSet=[{Key=Project,Value=${PROJECT_NAME}},{Key=Env,Value=shared},{Key=Owner,Value=platform},{Key=ManagedBy,Value=manual-bootstrap}]"

echo "State bucket: ${STATE_BUCKET}"
```

Kenapa begini: versioning memungkinkan rollback state yang rusak; Block Public Access wajib karena state bisa berisi data sensitif. Lock memakai native S3 lockfile (`use_lockfile = true`), jadi **tidak perlu** tabel DynamoDB ([ADR-0008](../adr/0008-terraform-state-environments.md)). Tag `ManagedBy=manual-bootstrap` menandai bahwa bucket ini sengaja tidak dikelola Terraform.

- [ ] Bucket state dibuat; nama dicatat: `________`

## 7. Secret di SSM Parameter Store

Secret dibuat lewat CLI agar nilainya tidak pernah masuk repo maupun Terraform state. Kerjakan di folder sementara **di luar repo**, dan pakai `file://` agar nilai tidak muncul di shell history atau daftar proses.

```bash
WORKDIR="$(mktemp -d)"
cd "$WORKDIR"
PARAM_PREFIX="/${PROJECT_NAME}/${ENV_NAME}"

# 1) Signing key room token (HS256)
openssl rand -base64 48 | tr -d '\n' > room-token-signing-key
aws ssm put-parameter --region "$AWS_REGION" --type SecureString \
  --name "${PARAM_PREFIX}/room-token-signing-key" --value "file://room-token-signing-key"

# 2) Key pair CloudFront signed cookies (RSA 2048)
openssl genrsa -out cloudfront-signing-private.pem 2048
openssl rsa -pubout -in cloudfront-signing-private.pem -out cloudfront-signing-public.pem
aws ssm put-parameter --region "$AWS_REGION" --type SecureString \
  --name "${PARAM_PREFIX}/cloudfront-signing-private-key" --value "file://cloudfront-signing-private.pem"

# 3) LiveKit API key dan secret
printf 'API%s' "$(openssl rand -hex 8)" > livekit-api-key
openssl rand -base64 48 | tr -d '\n' > livekit-api-secret
aws ssm put-parameter --region "$AWS_REGION" --type SecureString \
  --name "${PARAM_PREFIX}/livekit-api-key" --value "file://livekit-api-key"
aws ssm put-parameter --region "$AWS_REGION" --type SecureString \
  --name "${PARAM_PREFIX}/livekit-api-secret" --value "file://livekit-api-secret"

echo "Public key untuk repo: ${WORKDIR}/cloudfront-signing-public.pem"
```

Setelah selesai:
- [ ] Salin **hanya** `cloudfront-signing-public.pem` ke repo (lewat PR) di `infra/terraform/modules/edge/keys/cloudfront-signing-public.pem`. Public key bukan secret.
- [ ] Hapus folder sementara: `rm -rf "$WORKDIR"`. Jika private key hilang, cukup buat key pair baru dan rotasi (tidak perlu backup).
- [ ] Cek 4 parameter ada: `aws ssm get-parameters-by-path --path "/${PROJECT_NAME}/${ENV_NAME}" --query "Parameters[].Name"`

(Format API key LiveKit di atas adalah konvensi umum, **prior knowledge, unverified**. Cek dokumentasi LiveKit saat implementasi.)

## 8. GitHub Repository

- [ ] Repo **public** dibuat; nama dicatat: `<org>/<repo>` = `________`.
- [ ] Settings → Code security: aktifkan **secret scanning** dan **push protection**.
- [ ] Branch protection untuk `main`: wajib PR, minimal **1 approval**, status check CI wajib lulus, larang force push.
- [ ] Environment `prod` dibuat dengan **required reviewer** (Platform + Product & Tech Lead).
- [ ] Tidak ada AWS access key di GitHub Secrets. CI memakai OIDC role yang dibuat Terraform di langkah 9.

## 9. Apply Fondasi Terraform Pertama (Platform, dari Laptop)

Kode Terraform ditulis oleh Platform di hari 1–2. Langkah ini hanya urutan apply pertama.

1. `terraform init` di `infra/terraform/envs/prod` dengan backend bucket dari langkah 6.
2. Apply modul fondasi secara bertahap: `network`, `dns` (hosted zone dulu), IAM OIDC provider + role CI, `observability` dasar.
3. Catat output **4 nameserver** hosted zone `<project_name>.chescloud.my.id`.
4. Catat setiap apply (siapa, kapan, modul) di PROGRESS.md.

## 10. Delegasi DNS di Cloudflare (Pemilik Domain)

Dikerjakan **sekali** oleh pemilik domain `chescloud.my.id`.

1. Login Cloudflare → zone `chescloud.my.id` → DNS → Records.
2. Tambahkan **4 record NS** dengan nama `<project_name>` (misalnya `watchparty`) dan nilai 4 nameserver dari langkah 9. Status proxy tidak berlaku untuk NS (DNS only).
3. Jangan membuat record lain untuk subdomain ini di Cloudflare.
4. Cek delegasi:

```bash
dig NS "${PROJECT_NAME}.chescloud.my.id" +short
# Harus menampilkan 4 nameserver awsdns-xx yang sama dengan output Terraform
```

- [ ] Delegasi aktif (output `dig` sama dengan nameserver Route 53)
- [ ] Nameserver dicatat di sini: `________`

Setelah delegasi aktif, Platform bisa apply ACM (validasi DNS otomatis via Route 53) dan modul `edge`.

> Jika hosted zone pernah dihapus dan dibuat ulang, nameserver berubah. Ulangi langkah ini dengan nameserver baru.

## 11. Checklist Verifikasi Hari 1

Semua item harus dicek dan hasilnya dicatat di PROGRESS.md (entri 2 Nov 2026). Item yang gagal langsung dilaporkan ke Product & Tech Lead.

| # | Cek | Cara | Fallback jika gagal |
|---|---|---|---|
| D1 | Opsi **Free plan** ada di alur "Sign up for AWS (advanced)" | Langkah 1 | Pakai akun penulis draft PRD (cek plan & credits) |
| D2 | Plan akun = Free plan, credits terlihat | Billing → Account plan / Credits | Hentikan pekerjaan AWS, eskalasi ke Lead |
| D3 | **ACM di `us-east-1`** bisa request dan validasi sertifikat | Apply sertifikat CloudFront di modul `dns` | Eskalasi ke Lead (F-6.1 terancam) |
| D4 | **IAM user bisa login console** dengan MFA | Langkah 4 | Cek policy wajib MFA; perbaiki |
| D5 | **Instance type EC2** `t3.small` (dan `c7i-flex.large`) eligible dan bisa diluncurkan | Langkah 5 + apply modul `rtc` | Pilih type lain dari daftar Free plan |
| D6 | Budget dengan 4 alert aktif, credits tidak mengurangi angka budget | Langkah 3 | Perbaiki konfigurasi budget |
| D7 | Kuota Lambda concurrency cukup (≥ 50) | Langkah 5 | Ajukan kenaikan kuota |
| D8 | Runtime `python3.14` tersedia di `ap-southeast-1` | Deploy Lambda `GET /health` | Eskalasi ke Backend + Lead |
| D9 | API Gateway WebSocket, Cognito, CloudFront key group, Route 53 hosted zone bisa dibuat di Free plan | Apply fondasi | Eskalasi ke Lead |
| D10 | Delegasi DNS aktif | Langkah 10 | Cek ulang record NS di Cloudflare |
| D11 | Secret scanning + push protection GitHub aktif | Langkah 8 | Aktifkan |
| D12 | Tools anggota: Node.js 26 LTS, Python 3.14 (via uv), Terraform `>= 1.17` | `node -v`, `uv python list`, `terraform version` | Install versi yang benar |

## 12. Selesai

- [ ] Semua langkah di atas dicentang dan dicatat di PROGRESS.md.
- [ ] Nilai yang dicatat di runbook ini (nama bucket, nameserver, `<org>/<repo>`) **bukan secret** dan boleh di-commit. Jangan pernah menulis password, OTP, atau isi secret di sini.
