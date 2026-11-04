## Apa

<!-- Ringkas perubahan dalam 1-3 poin. Sebut ID terkait: F-x.y / US-x.y / NFR-x.y / ADR-NNNN. -->

-

## Kenapa

<!-- Masalah atau kebutuhan apa yang diselesaikan. Link ke issue, AC, atau ADR. -->

-

## Cara Test

<!-- Langkah yang bisa diulang reviewer + hasilnya. Untuk fitur: AC Given/When/Then mana yang dites. -->

- [ ] Test otomatis: <!-- perintah, misalnya `uv run pytest`, `npm run build` -->
- [ ] Test manual: <!-- langkah dan hasil -->
- [ ] Dicek di produksi (`https://<project_name>.chescloud.my.id`), jika fitur terlihat pengguna

## Infrastruktur (isi jika mengubah Terraform)

- Ringkasan `terraform plan`: `__ to add, __ to change, __ to destroy`
- Resource penting yang berubah:
- [ ] Tidak ada resource dari daftar terlarang (NAT Gateway, ElastiCache, ALB, WAF, Lambda@Edge, Chime, MediaConvert, Organizations)
- [ ] Tag wajib ada (`Project`, `Env`, `Owner`, `ManagedBy`)
- [ ] IAM permission baru bersifat least privilege
- [ ] Dampak biaya sudah diperkirakan: <!-- misalnya "tidak ada" atau "+$x/bulan" -->

## Checklist

- [ ] Judul PR mengikuti Conventional Commits (bahasa Inggris), misalnya `feat(realtime): handle playback.command`
- [ ] Mengikuti contract di `docs/contracts/` (atau contract sudah diperbarui dan di-approve konsumen)
- [ ] Tidak ada secret, token, atau password di kode, config, maupun log
- [ ] CI lulus (lint, test, build, terraform fmt/validate/tflint, gitleaks)

## Dokumentasi

- [ ] Tidak perlu perubahan dokumentasi, **atau** dokumen berikut sudah diperbarui:
  - [ ] `docs/architecture.md`
  - [ ] ADR baru/diperbarui: <!-- ADR-NNNN -->
  - [ ] `docs/contracts/`
  - [ ] `docs/runbooks/`
  - [ ] README komponen
- [ ] Entri hari ini di `docs/PROGRESS.md` sudah ditambah
- [ ] PRD tidak diubah, **atau** ini change request resmi (ADR + approval Product & Tech Lead dan pemilik role terdampak + Changelog PRD)
