# Panduan Kontribusi

> Nama produk masih nama kerja; difiksasi Senin 2 Nov 2026.

Dokumen ini berisi aturan kerja tim. Tujuannya agar 6 orang bisa bekerja paralel tanpa saling menunggu (non-blocking), dan semua perubahan bisa diaudit. Jika memakai AI agent, agent wajib mengikuti [AGENTS.md](AGENTS.md), yang isinya sejalan dengan dokumen ini.

## 1. Prinsip

1. **Contract-first.** OpenAPI ([docs/contracts/openapi.yaml](docs/contracts/openapi.yaml)) dan pesan WebSocket ([docs/contracts/ws-messages.md](docs/contracts/ws-messages.md)) di-freeze di hari 1–2 (tag `contracts-v1.0`). FE bekerja dengan mock dari contract; BE mengimplementasikan contract.
2. **Semua infrastruktur lewat Terraform.** ClickOps hanya untuk langkah bootstrap yang tertulis di [docs/runbooks/bootstrap.md](docs/runbooks/bootstrap.md).
3. **Setiap role memiliki kode dan modul Terraform-nya sendiri** (lihat PRD §11).
4. **Semua bisa diaudit:** setiap perubahan lewat PR, setiap keputusan besar punya ADR, setiap hari kerja punya entri di [docs/PROGRESS.md](docs/PROGRESS.md).
5. **Free plan first:** tidak boleh ada resource yang bisa menimbulkan tagihan atau meng-upgrade akun ke Paid plan.

## 2. Aturan Bahasa

| Apa | Bahasa | Contoh |
|---|---|---|
| Dokumentasi (`docs/`, README, CONTRIBUTING, isi template PR, isi ADR) | **Bahasa Indonesia** sederhana | "Room token dibuat saat join." |
| Istilah teknis yang umum dalam bahasa Inggris | Tetap bahasa Inggris | deploy, rollback, WebSocket, signed cookies, idempotent |
| Identifier: nama function, variabel, class, file kode, resource/variabel Terraform, nama bucket, tag, branch, field JSON, event type, kode error | **Bahasa Inggris** | `create_room`, `playbackState`, `watchparty-prod-media-<account_id>`, `feat/realtime-playback-command` |
| Commit message | **Bahasa Inggris** (Conventional Commits) | `feat(realtime): handle playback.command` |
| Komentar di kode | Bahasa Inggris | `# Reject stale updates via conditional write` |
| Nama file dokumen | Bahasa Inggris, kebab-case | `0003-realtime-sync-architecture.md` |
| AGENTS.md | Bahasa Inggris (boleh), tetapi wajib menyebut aturan bahasa ini | — |

## 3. Alur Git

- **Trunk-based development.** Branch utama: `main`. Branch fitur berumur pendek (target ≤ 1 hari, maksimal 2 hari).
- Nama branch: `<type>/<short-description>` dalam bahasa Inggris, kebab-case. Contoh: `feat/rest-join-room`, `fix/sync-drift-threshold`, `docs/adr-0009-rate-limit`, `chore/ci-gitleaks`.
- Rebase atau merge `main` ke branch sesering mungkin agar konflik kecil.
- Merge ke `main` lewat **squash merge**; judul squash mengikuti Conventional Commits.
- Dilarang: push langsung ke `main`, force push ke `main`, menonaktifkan hook atau check CI.

### 3.1 Conventional Commits

Format: `<type>(<scope>): <description>`

| Type | Kapan |
|---|---|
| `feat` | Fitur baru |
| `fix` | Perbaikan bug |
| `docs` | Hanya dokumentasi |
| `refactor` | Perubahan kode tanpa mengubah perilaku |
| `test` | Menambah/mengubah test |
| `ci` | Workflow CI/CD |
| `chore` | Tooling, dependency, hal kecil lain |
| `perf` | Peningkatan performa |

Scope yang disarankan: `api`, `realtime`, `auth`, `data`, `rtc`, `media`, `player`, `sync`, `social`, `infra`, `ci`, `docs`, `contracts`.

Breaking change: tambahkan `!` (misalnya `feat(contracts)!: rename positionSec`) dan jelaskan di body. Breaking change pada contract setelah freeze butuh approval khusus (§6).

## 4. Pull Request

- Setiap perubahan ke `main` lewat PR dengan [template PR](.github/pull_request_template.md): **apa**, **kenapa**, **cara test**, dan checklist dokumentasi.
- Minimal **1 reviewer** yang approve. Untuk perubahan di modul/kode milik role lain, reviewer harus dari role pemiliknya.
- PR kecil dan fokus (target < 400 baris diff, di luar lockfile dan file generate).
- CI wajib lulus sebelum merge (§5).
- PR yang mengubah Terraform wajib melampirkan ringkasan `terraform plan` (jumlah add/change/destroy dan resource penting).

### 4.1 CODEOWNERS

File `.github/CODEOWNERS` dibuat oleh Platform **setelah role di-assign** (Senin 2 Nov 2026). Pemetaan yang direncanakan:

| Path | Pemilik (role) |
|---|---|
| `docs/PRD-watch-party.md`, `docs/adr/` | Product & Tech Lead |
| `docs/contracts/` | Backend + Product & Tech Lead |
| `infra/terraform/envs/`, `infra/terraform/modules/{network,dns,observability}/`, `.github/workflows/` | Platform |
| `infra/terraform/modules/edge/` | Platform + RTC/Media (co-owner untuk key group dan behavior `/media/*`, sesuai PRD §11.1 dan architecture.md §12.5) |
| `infra/terraform/modules/{auth,data,api,realtime}/`, `backend/` | Backend |
| `infra/terraform/modules/rtc/`, `media/` | RTC/Media |
| `frontend/src/` bagian player dan sync | FE-Player |
| `frontend/src/` bagian video, chat, reactions, participants | FE-Social |

## 5. CI (Wajib Lulus)

| Check | Untuk | Tool |
|---|---|---|
| Format Terraform | `infra/` | `terraform fmt -check -recursive` |
| Validasi Terraform | `infra/` | `terraform validate` |
| Lint Terraform | `infra/` | `tflint` |
| Plan Terraform | `infra/envs/prod` | `terraform plan` (role OIDC read-only) |
| Lint + format Python | `backend/`, `media/` | `ruff check`, `ruff format --check` |
| Test Python | `backend/` | `pytest` |
| Lint + build FE | `frontend/` | ESLint, `npm run build` (+ unit test jika ada) |
| Secret scanning | Seluruh repo | `gitleaks` |

Repo ini **public**: jika gitleaks menemukan secret, PR tidak boleh di-merge. Jika secret sudah sempat ter-push, **rotasi secret itu segera** (menghapus commit saja tidak cukup) lalu catat di PROGRESS.md.

## 6. Aturan Infrastruktur

- Semua resource AWS dibuat dengan Terraform di `infra/terraform/`. Perubahan manual di console (selain runbook bootstrap) dilarang; jika terpaksa saat insiden, catat di PROGRESS.md dan import/samakan ke Terraform di hari yang sama.
- Nama resource: `<project_name>-<env>-<komponen>`, semua dari variabel `project_name` dan `env`. Jangan hardcode nama produk.
- Tag wajib di semua resource: `Project`, `Env`, `Owner`, `ManagedBy = terraform`.
- Region dari variabel `aws_region` (`ap-southeast-1`); pengecualian hanya ACM CloudFront di `us-east-1`.
- **Dilarang** (hard rule): NAT Gateway, ElastiCache/Redis, ALB/NLB, WAF di CloudFront, Lambda@Edge, Amazon Chime SDK, AWS Elemental MediaConvert, AWS Organizations, Control Tower, IAM Identity Center, Lambda di dalam VPC, instance type EC2 di luar daftar Free plan (t3.micro, t3.small, t4g.micro, t4g.small, c7i-flex.large, m7i-flex.large), runtime/versi EOL atau deprecated (termasuk Node.js 20).
- Secret hanya di SSM Parameter Store (SecureString), dibuat lewat runbook. Jangan pernah menaruh secret di kode, `*.tfvars`, Terraform state (jika bisa dihindari), log, atau GitHub Secrets (selain yang memang perlu dan disetujui Lead).
- Sebelum menambah service AWS baru: cek apakah tersedia di Free plan, perkirakan biayanya, dan buat ADR.

## 7. Aturan Contract

- `docs/contracts/` adalah sumber kebenaran untuk REST dan WebSocket. Kode mengikuti contract, bukan sebaliknya.
- Konvensi nama field JSON: **camelCase** di REST dan WebSocket. Waktu epoch ms memakai sufiks `Ms`, durasi/posisi detik memakai sufiks `Sec`.
- Kode error sama untuk REST dan WebSocket.
- Setelah tag `contracts-v1.0`, perubahan contract lewat PR yang di-approve Product & Tech Lead dan **semua role konsumen**. Perubahan breaking menaikkan versi protokol (lihat ws-messages.md §8).
- `openapi.yaml` wajib valid OpenAPI 3.1 (cek dengan `uvx --from openapi-spec-validator openapi-spec-validator docs/contracts/openapi.yaml`).
- `ws-messages.schema.json` wajib valid JSON Schema 2020-12 (cek dengan `uvx --from check-jsonschema check-jsonschema --check-metaschema docs/contracts/ws-messages.schema.json`) dan isinya sama dengan `ws-messages.md`. Ubah keduanya di PR yang sama.

## 8. Aturan Dokumentasi

### 8.1 Tiga Level Dokumentasi

| Level | Kapan | Di mana | Isi |
|---|---|---|---|
| Per PR | Setiap PR | Deskripsi PR (template) | Apa, kenapa, cara test, dokumen yang diperbarui |
| Per keputusan | Setiap keputusan arsitektur yang sulit dibatalkan, lintas role, atau berdampak biaya/keamanan | `docs/adr/NNNN-*.md` | Konteks, keputusan, alternatif, konsekuensi, verifikasi ([cara menulis](docs/adr/README.md)) |
| Per hari | Setiap hari kerja | `docs/PROGRESS.md` | Selesai, keputusan + alasan, blocker, berikutnya (+ biaya & credits setiap Senin) |

### 8.2 Letak Dokumen

| Jenis | Lokasi | Pemilik |
|---|---|---|
| Kebutuhan produk (apa & kenapa, stabil) | `docs/PRD-watch-party.md` | Product & Tech Lead |
| Desain teknis (bagaimana, boleh berubah) | `docs/architecture.md` | Product & Tech Lead + semua role |
| Keputusan arsitektur | `docs/adr/` | Role terkait |
| Kontrak API | `docs/contracts/` | Backend |
| Langkah operasional manual | `docs/runbooks/` | Role terkait |
| Log harian | `docs/PROGRESS.md` | Semua |
| Cara menjalankan modul/komponen | `README.md` di folder komponen | Pemilik komponen |
| Arsip (read-only) | `docs/archive/` | — |

### 8.3 Cara Menulis

- Bahasa Indonesia sederhana, kalimat pendek, satu ide per kalimat. Istilah teknis tetap bahasa Inggris.
- Tulis angka yang spesifik (ms, KB, USD, tanggal), bukan kata seperti "cepat" atau "murah".
- Pakai ID yang sudah ada: fitur `F-x.y`, user story `US-x.y`, NFR `NFR-x.y`, risiko `R-x`, open question `OQ-x`. Jangan membuat ID baru untuk hal yang sudah punya ID.
- Angka teknis (limit, TTL, rate limit, target) hanya didefinisikan di [architecture.md §3](docs/architecture.md#3-angka-kunci-single-source-of-truth). Dokumen lain mereferensikannya. Jika angka berubah, ubah di sana dulu, lalu sinkronkan dokumen lain di PR yang sama.
- Klaim tentang AWS diberi label: `verified (AWS docs)`, `verified (sumber pihak ketiga)`, `prior knowledge, unverified`, atau `perlu dicek hari 1`, dengan link sumber.
- Versi software tidak ditulis di PRD; tulis di architecture.md §14. Versi package di-lock lewat lockfile.
- Diagram memakai Mermaid di dalam Markdown.
- Nama produk hanya ditulis di sedikit tempat; identifier teknis memakai `project_name`.

### 8.4 Menjaga Dokumen Tetap Sinkron

- PR yang mengubah perilaku, contract, atau infrastruktur **wajib** memperbarui dokumen terkait di PR yang sama.
- PRD setelah freeze (`prd-v1.0`) hanya berubah lewat change request: PR + ADR baru, approve oleh Product & Tech Lead dan pemilik role terdampak, catat di Changelog PRD, buat tag baru (`prd-v1.1`, dst.).
- ADR yang sudah `Accepted` tidak diedit; buat ADR baru yang men-supersede.
- `docs/archive/` tidak boleh diubah.

## 9. Definition of Done

Sebuah item (fitur, perbaikan, atau perubahan infra) dianggap selesai jika:

- [ ] Semua acceptance criteria (Given/When/Then) terkait di PRD lulus, dan cara test-nya tertulis di PR.
- [ ] Kode mengikuti contract di `docs/contracts/`; jika contract perlu berubah, sudah lewat proses §7.
- [ ] Test otomatis ditambahkan/diperbarui (unit test untuk logika; integration test untuk alur penting) dan CI lulus.
- [ ] Infrastruktur yang dibutuhkan ada di Terraform, sudah di-apply ke `prod`, dan `terraform plan` setelahnya menunjukkan 0 perubahan.
- [ ] Tidak ada secret di kode/log; IAM permission baru bersifat least privilege.
- [ ] Logging dan metric yang relevan ada (terutama untuk SLI di PRD §14).
- [ ] Dokumen terkait diperbarui (architecture.md, ADR, contract, runbook, README komponen).
- [ ] Entri PROGRESS.md hari itu mencatat item ini.
- [ ] PR di-review dan di-approve minimal 1 orang, lalu di-merge ke `main`.
- [ ] Sudah dicek di URL produksi (`https://<project_name>.chescloud.my.id`) untuk fitur yang terlihat pengguna.

## 10. Biaya

- Setiap anggota boleh dan wajib menghentikan resource yang mencurigakan biayanya, lalu melapor ke Platform.
- Alert budget 50% atau lebih: Platform mengumumkan di grup tim dan mencatat penyebabnya di PROGRESS.md.
- EC2 LiveKit di-stop saat tidak dipakai (atau pakai stop terjadwal).
- Setelah proyek dinilai: jalankan `terraform destroy` (kecuali state bucket) sebelum credits habis.
