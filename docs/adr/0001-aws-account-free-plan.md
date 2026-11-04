# ADR-0001: Akun AWS & Free Plan

| Atribut | Nilai |
|---|---|
| Status | Proposed |
| Tanggal | 2026-10-31 |
| Pemilik | Platform |
| Terkait | PRD C-1, C-3, NFR-5.2, R-1, R-2; ADR-0002 |

## Konteks

- Tim terdiri dari 6 mahasiswa. Tidak semua anggota paham bahwa deploy service sembarangan bisa menimbulkan tagihan besar. Tim ingin **tidak ada risiko tagihan sama sekali**.
- Penulis draft PRD sudah punya akun AWS (dibuat ±1 bulan lalu) yang dipakai di proyek sebelumnya. Tim ingin tanggung jawab tidak menumpuk di satu orang, jadi akun baru milik anggota lain lebih disukai. Akun penulis bisa menjadi cadangan.
- Fakta AWS Free plan (Oktober 2026):
  - Free plan tidak menimbulkan tagihan. Saat signup ada credits $100, dan bisa mendapat sampai $100 tambahan dari aktivitas onboarding.
  - Free plan berakhir setelah 6 bulan atau saat credits habis (mana yang lebih dulu). Setelah itu akun di-suspend; data disimpan 90 hari dan bisa dipulihkan dengan upgrade ke Paid plan dalam 90 hari.
  - Akun yang bergabung ke AWS Organizations atau memasang AWS Control Tower landing zone **otomatis di-upgrade ke Paid plan** dan credits-nya hangus.
  - Free plan tidak bisa mengakses service yang langsung menghabiskan credits atau pembelian hardware. EC2 dibatasi ke instance type tertentu.
  - Akun yang dibuat lewat alur baru "Sign up for AWS (new)" dikunci ke satu region berdasarkan negara (Indonesia → `ap-southeast-2`) dan tidak bisa memakai Chime SDK maupun MediaConvert.

## Keputusan

1. Memakai **akun AWS baru** milik satu anggota tim (pemegang role Platform, TBD), dibuat lewat **"Sign up for AWS (advanced)"** dengan memilih **Free plan**. Akun penulis draft PRD menjadi **cadangan**.
2. **Dilarang:** bergabung ke AWS Organizations, memasang Control Tower, dan memakai IAM Identity Center (butuh Organizations).
3. Akses tim lewat **IAM user per anggota dengan MFA wajib**. CI memakai **IAM role untuk GitHub Actions OIDC** (tanpa access key di GitHub).
4. Proteksi biaya: **AWS Budgets** dengan budget bulanan (default $50, variabel `monthly_budget_usd`) dan alert di **25%, 50%, 75%, 90%**, plus cek sisa credits mingguan yang dicatat di PROGRESS.md.
5. Hanya instance type EC2 yang eligible Free plan yang boleh dipakai: t3.micro, t3.small, t4g.micro, t4g.small, c7i-flex.large, m7i-flex.large.

## Alternatif yang Dipertimbangkan

| Alternatif | Kelebihan | Kekurangan | Alasan ditolak |
|---|---|---|---|
| Paid plan (pay-as-you-go) | Akses semua service, credits tetap dipakai | Bisa muncul tagihan nyata jika ada kesalahan | Risiko biaya bertentangan dengan tujuan tim |
| Akun penulis draft PRD sebagai akun utama | Sudah ada, sudah dikenal | Tanggung jawab menumpuk di satu orang; kondisi credits tidak diketahui | Jadi cadangan saja |
| "Sign up for AWS (new)" | Alur lebih sederhana | Region terkunci ke `ap-southeast-2`, tanpa Chime/MediaConvert | Membatasi pilihan region |
| AWS Organizations + IAM Identity Center | Best practice multi-akun, SSO | Otomatis upgrade ke Paid plan | Melanggar constraint Free plan |

## Konsekuensi

- **Positif:** tidak ada tagihan; risiko kesalahan biaya dibatasi oleh credits; tanggung jawab akun ada di role Platform.
- **Negatif / trade-off:**
  - IAM user + MFA adalah kompromi (bukan best practice SSO), tetapi wajar untuk satu akun dan 6 orang.
  - Saat credits habis, layanan berhenti. Tim harus memantau credits.
  - Instance type EC2 terbatas (berdampak ke ADR-0004).
- **Tindak lanjut:** checklist hari 1 di [runbooks/bootstrap.md](../runbooks/bootstrap.md); larangan dicatat di AGENTS.md dan CONTRIBUTING.md.

## Verifikasi

| Klaim | Status | Sumber |
|---|---|---|
| Credits $100 + sampai $100 tambahan; Free plan berakhir 6 bulan/credits habis; suspend + data 90 hari; upgrade dalam 90 hari | verified (AWS docs) | [Choosing a plan](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html), [Upgrade your account](https://docs.aws.amazon.com/accounts/latest/reference/upgrade-account.html) |
| Join Organizations / Control Tower → otomatis upgrade ke Paid plan | verified (AWS docs) | [Free Tier FAQs](https://aws.amazon.com/free/faqs/) |
| Free plan tidak bisa akses service tertentu | verified (AWS docs) | [Explore AWS services with Free Tier](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier.html) |
| Daftar instance type EC2 eligible Free plan (akun dibuat sejak 15 Jul 2025) | verified (AWS docs) | [EC2 Free Tier usage](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html) |
| "Sign up for AWS (new)" mengunci region per negara (Indonesia → `ap-southeast-2`) | verified (AWS docs) | [AWS Regions for your projects](https://docs.aws.amazon.com/accounts/latest/reference/project-regions.html) |
| "Sign up for AWS (new)" tidak mendukung Chime SDK, MediaConvert, Organizations, Control Tower, IAM Identity Center (kecuali advanced features diaktifkan) | verified (AWS docs) | [Supported AWS services for Sign up for AWS (new)](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html) |
| Opsi Free plan muncul di alur "Sign up for AWS (advanced)" | perlu dicek hari 1 | Runbook cek D1. Fallback: akun penulis draft PRD |
| IAM user bisa login console dengan MFA di akun Free plan | perlu dicek hari 1 | Runbook cek D4 |
| Budget dapat diset untuk tidak mengurangi credits (agar alert mencerminkan pemakaian credits) | perlu dicek hari 1 | Runbook cek D6 |
