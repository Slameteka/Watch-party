# Architecture Decision Records (ADR)

ADR adalah dokumen pendek yang mencatat **satu** keputusan arsitektur: konteksnya, apa yang dipilih, alternatif yang ditolak, dan konsekuensinya. Tujuannya agar anggota tim (dan AI agent) tahu *kenapa* sesuatu dibuat seperti itu, tanpa harus bertanya lagi.

## Daftar ADR

| No | Judul | Status | Pemilik |
|---|---|---|---|
| [0001](0001-aws-account-free-plan.md) | Akun AWS & Free plan | Proposed | Platform |
| [0002](0002-region.md) | Region AWS | Proposed | Platform |
| [0003](0003-realtime-sync-architecture.md) | Arsitektur sinkronisasi real-time | Proposed | Backend |
| [0004](0004-video-chat-livekit.md) | Video chat dengan LiveKit self-hosted | Proposed | RTC/Media |
| [0005](0005-media-pipeline-content.md) | Pipeline media & konten | Proposed | RTC/Media |
| [0006](0006-dns-domain.md) | DNS & domain | Proposed | Platform |
| [0007](0007-authentication-model.md) | Model autentikasi | Proposed | Backend |
| [0008](0008-terraform-state-environments.md) | Terraform state & environment | Proposed | Platform |

Semua ADR berstatus **Proposed** sampai PRD di-freeze (tag `prd-v1.0`, Senin 2 Nov 2026). Saat freeze, Product & Tech Lead mengubah statusnya menjadi **Accepted** dalam PR yang sama.

## Kapan Menulis ADR

Tulis ADR jika keputusan:
- sulit atau mahal untuk dibatalkan (misalnya pilihan database, region, model autentikasi);
- mempengaruhi lebih dari satu role atau modul Terraform;
- mengubah biaya atau risiko keamanan;
- mengubah PRD setelah freeze (wajib, sebagai bagian change request).

Tidak perlu ADR untuk keputusan kecil yang mudah diubah (nama variabel lokal, styling, pilihan library kecil di dalam satu modul).

## Cara Menulis

1. Salin [0000-template.md](0000-template.md) menjadi `NNNN-judul-pendek-dalam-bahasa-inggris.md` dengan nomor berikutnya (4 digit). Nama file memakai bahasa Inggris (kebab-case); isi dokumen dalam Bahasa Indonesia.
2. Isi semua bagian: Konteks, Keputusan, Alternatif yang Dipertimbangkan, Konsekuensi, Verifikasi.
3. Di bagian **Verifikasi**, beri label setiap klaim fakta (terutama tentang AWS): `verified (AWS docs)`, `verified (sumber pihak ketiga)`, `prior knowledge, unverified`, atau `perlu dicek hari 1`. Sertakan link sumber.
4. Buka PR dengan status `Proposed`. Reviewer minimal: Product & Tech Lead + pemilik role yang terdampak.
5. Setelah di-merge, ubah status menjadi `Accepted` dan tambahkan baris di tabel di atas.

## Aturan

- ADR yang sudah `Accepted` **tidak diedit isinya**. Jika keputusan berubah, buat ADR baru dan ubah status ADR lama menjadi `Superseded oleh ADR-XXXX`.
- Perbaikan typo atau link rusak boleh langsung.
- Setiap ADR baru dicatat juga di entri harian [PROGRESS.md](../PROGRESS.md).
