# ADR-0008: Terraform State & Environment

| Atribut | Nilai |
|---|---|
| Status | Proposed |
| Tanggal | 2026-10-31 |
| Pemilik | Platform |
| Terkait | NFR-5.1; C-4; OQ-5; ADR-0001 |

## Konteks

- Semua infrastruktur harus auditable lewat IaC. Draft v0 memakai AWS CDK (TypeScript); tim lebih familiar dengan Terraform.
- 6 orang akan mengubah infrastruktur secara paralel, jadi state harus remote dan terkunci saat dipakai.
- Terraform terbaru adalah 1.17.1 (28 Okt 2026). Backend S3 sudah mendukung **native lockfile** (`use_lockfile = true`), sehingga tabel DynamoDB untuk lock tidak lagi diperlukan.
- Waktu implementasi 7 hari dan credits terbatas. Satu EC2 LiveKit tambahan untuk environment kedua akan menggandakan komponen biaya terbesar.
- Repo public: tidak boleh ada secret di repo maupun di nilai yang dikirim ke Terraform state jika bisa dihindari.

## Keputusan

1. **Terraform `>= 1.17`** dengan provider **`hashicorp/aws ~> 6.70`** (+ alias `us_east_1`). **AWS CDK tidak dipakai.**
2. **Remote state di S3** dengan **native S3 lockfile** (`use_lockfile = true`, `encrypt = true`), bucket `<project_name>-tfstate-<account_id>` dengan versioning dan Block Public Access. **Tanpa tabel lock DynamoDB.** Bucket dibuat sekali lewat [runbooks/bootstrap.md](../runbooks/bootstrap.md).
3. **Modul per domain:** `network`, `dns`, `edge`, `auth`, `data`, `api`, `realtime`, `rtc`, `observability`. Setiap modul punya satu role pemilik (lihat [architecture.md §12.5](../architecture.md#125-modul)).
4. **Default tags wajib:** `Project`, `Env`, `Owner`, `ManagedBy = terraform`.
5. **Satu environment `prod`** (folder `infra/terraform/envs/prod/`). Struktur disiapkan agar `dev` bisa ditambah nanti dengan folder `envs/dev/` dan state key sendiri.
6. Secret tidak dibuat oleh Terraform. Terraform hanya mereferensikan nama parameter SSM yang dibuat lewat runbook.
7. Hari 1–2 Platform boleh `apply` dari laptop (sesi MFA, dicatat di PROGRESS.md). Setelah M1, `apply` hanya lewat GitHub Actions dari `main` dengan approval environment `prod`.

## Alternatif yang Dipertimbangkan

| Alternatif | Kelebihan | Kekurangan | Alasan ditolak |
|---|---|---|---|
| AWS CDK (draft v0) | Bahasa pemrograman umum | Tim lebih familiar dengan Terraform; CloudFormation lebih lambat untuk iterasi | Preferensi dan pengalaman tim |
| State lokal | Tanpa setup | Tidak bisa kolaborasi; rawan hilang | Tidak cocok untuk 6 orang |
| S3 + tabel lock DynamoDB | Pola lama yang dikenal | Resource tambahan yang tidak lagi diperlukan | Native lockfile sudah tersedia |
| HCP Terraform (Terraform Cloud) | UI, run remote | Akun pihak ketiga, kredensial AWS di luar | Tambah dependency |
| Dua environment (`dev` + `prod`) sejak awal | Test terpisah dari URL publik | Biaya ±2× (terutama EC2 + egress), waktu setup bertambah | Waktu 7 hari dan credits terbatas |
| Satu state untuk semua tanpa modul | Sederhana | Konflik antar role; ownership tidak jelas | Melanggar prinsip non-blocking |

## Konsekuensi

- **Positif:** state aman dan terkunci; ownership modul jelas; biaya dan waktu setup minimal.
- **Negatif / trade-off:**
  - **Satu environment** berarti test integrasi terjadi di `prod`; bug bisa terlihat di URL publik. Mitigasi: test lokal + mock, plan direview di PR, approval apply, **freeze deploy 24 jam sebelum demo**.
  - Satu state untuk `prod` berarti apply oleh satu orang/CI pada satu waktu (dijamin lockfile). Antrean apply bisa terjadi di hari sibuk.
  - Role CI deploy masih cukup luas (kompromi praktis, lihat [architecture.md §9.2](../architecture.md#92-akses-ci-github-actions-oidc)).
- **Tindak lanjut:** keputusan final jumlah environment di OQ-5 (Sen 2 Nov 2026); CI menjalankan `terraform fmt -check`, `terraform validate`, `tflint` di setiap PR.

## Verifikasi

| Klaim | Status | Sumber |
|---|---|---|
| Terraform 1.17.0 rilis 21 Okt 2026 | verified (sumber pihak ketiga) | [hashicorp/terraform releases](https://github.com/hashicorp/terraform/releases) |
| Terraform 1.17.1 adalah versi terbaru (28 Okt 2026) | verified (sumber pihak ketiga) | [HashiCorp releases: terraform](https://releases.hashicorp.com/terraform/) (1.17.1 paling atas saat dicek 31 Okt 2026) |
| Provider `hashicorp/aws` 6.70 adalah versi terbaru | verified (sumber pihak ketiga) | [Terraform Registry AWS provider](https://registry.terraform.io/providers/hashicorp/aws/latest) |
| Backend S3 mendukung `use_lockfile` (native lock) tanpa DynamoDB | verified (sumber pihak ketiga) | [S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3) |
