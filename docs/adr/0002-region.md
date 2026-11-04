# ADR-0002: Region AWS

| Atribut | Nilai |
|---|---|
| Status | Proposed |
| Tanggal | 2026-10-31 |
| Pemilik | Platform |
| Terkait | PRD C-2, NFR-1.1; ADR-0001, ADR-0006 |

## Konteks

- Pengguna utama ada di Indonesia. Kandidat region: `ap-southeast-1` (Singapore) dan `ap-southeast-3` (Jakarta).
- Tim lebih mengutamakan **ketersediaan service** daripada latensi, tetapi Jakarta tetap dipertimbangkan jika semua service tersedia.
- Service inti (Cognito, API Gateway v2, Lambda, DynamoDB, EC2) tersedia di kedua region.
- Jakarta adalah **opt-in region**: harus diaktifkan manual, dan perilakunya di Free plan belum pasti.
- Target sinkronisasi adalah 500 ms (p95). Selisih latensi Jakarta vs Singapore dari Indonesia hanya belasan ms, kecil dibanding target ini.

## Keputusan

Memakai **`ap-southeast-1` (Singapore)** sebagai satu-satunya region aplikasi. Region adalah variabel Terraform `aws_region`. Pengecualian: sertifikat ACM untuk CloudFront wajib di `us-east-1` (provider alias).

## Alternatif yang Dipertimbangkan

| Alternatif | Kelebihan | Kekurangan | Alasan ditolak |
|---|---|---|---|
| `ap-southeast-3` (Jakarta) | Latensi sedikit lebih rendah; data di Indonesia | Opt-in region (aktivasi manual); perilaku Free plan belum pasti; risiko ada fitur/service yang belum tersedia | Risiko lebih besar dari manfaat latensi yang kecil |
| `ap-southeast-2` (Sydney) | Region yang dikunci untuk akun Indonesia dari alur "Sign up for AWS (new)" | Latensi lebih tinggi dari Indonesia | Tidak perlu karena memakai signup advanced |
| Multi-region | Ketersediaan lebih tinggi | Biaya dan kompleksitas jauh lebih besar | Di luar scope dan budget |

## Konsekuensi

- **Positif:** region default (tidak perlu opt-in), service paling lengkap di Asia Tenggara, latensi rendah dari Indonesia.
- **Negatif / trade-off:** data disimpan di luar Indonesia. Untuk produk tugas kuliah dengan data minimal (lihat NFR-3.7) ini diterima.
- **Tindak lanjut:** karena region adalah variabel, pindah ke Jakarta di masa depan cukup dengan mengubah `aws_region` dan apply ulang (plus migrasi data jika ada).

## Verifikasi

| Klaim | Status | Sumber |
|---|---|---|
| Cognito, API Gateway v2, Lambda, DynamoDB, EC2 tersedia di `ap-southeast-1` dan `ap-southeast-3` | verified (AWS docs) | [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/) |
| `ap-southeast-3` adalah opt-in region | verified (AWS docs) | [AWS Regions](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html), [Enable or disable Regions](https://docs.aws.amazon.com/general/latest/gr/rande-manage.html) |
| Perilaku Free plan untuk opt-in region | prior knowledge, unverified | — |
| Selisih latensi Jakarta vs Singapore dari Indonesia hanya belasan ms | prior knowledge, unverified | — |
| ACM untuk CloudFront wajib `us-east-1` | verified (AWS docs) | [CloudFront: requirements for using SSL/TLS certificates](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html) |
