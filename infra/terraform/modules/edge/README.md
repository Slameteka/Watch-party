# Modul `edge`

CloudFront + S3 untuk web app (SPA) dan film HLS. Desain: [architecture.md §9.5](../../../../docs/architecture.md#95-s3-cloudfront-signed-cookies), [ADR-0005](../../../../docs/adr/0005-media-pipeline-content.md), [ADR-0006](../../../../docs/adr/0006-dns-domain.md).

## Pemilik

| Bagian | File | Pemilik |
|---|---|---|
| Web bucket, distribution, default behavior, CloudFront Function SPA, response headers, record apex | `main.tf`, `cloudfront.tf`, `iam.tf` (record) | Platform |
| Media bucket, public key + key group, behavior `/media/*` dan `/posters/*`, policy publisher | `main.tf`, `cloudfront.tf`, `iam.tf`, `keys/` | RTC/Media (co-owner) |

Perubahan di bagian milik role lain wajib di-review role tersebut (CONTRIBUTING §4.1).

## Isi

| Resource | Keterangan |
|---|---|
| S3 `<project_name>-<env>-web-<account_id>` | Build SPA. Privat, SSE-S3, Block Public Access, BucketOwnerEnforced |
| S3 `<project_name>-<env>-media-<account_id>` | `media/<mediaId>/...` (HLS) dan `posters/<mediaId>.jpg`. Pengaturan sama dengan web bucket |
| Bucket policy | Hanya `cloudfront.amazonaws.com` dengan `AWS:SourceArn` = distribution ini (OAC). Request tanpa HTTPS ditolak |
| Origin access control | Satu OAC (SigV4, `always`) untuk kedua bucket |
| Public key + key group | Public key dari `keys/cloudfront-signing-public.pem`. Private key hanya di SSM `/<project_name>/<env>/cloudfront-signing-private-key` |
| CloudFront Function | `functions/spa-routing.js`: path tanpa ekstensi file → `/index.html`. Hanya di default behavior |
| Response headers policy | HSTS 1 tahun, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`. CSP dari variabel `content_security_policy` (kosong = belum dipasang) |
| Distribution | Default `/*` → web (publik). `/media/*` → media, **trusted key group** (signed cookies), HTTPS saja. `/posters/*` → media, publik. Tanpa custom error response |
| Policy IAM `<project_name>-<env>-media-publisher` | Untuk `media/scripts/publish_media.py`: tulis `media/*` dan `posters/*` di media bucket, `dynamodb:PutItem` hanya untuk item `PK = CATALOG` |
| Record A/AAAA apex | Alias ke distribution. Dibuat hanya jika `acm_certificate_arn` dan `route53_zone_id` diisi |

### Cache

| Behavior | Cache policy (AWS managed) | Alasan |
|---|---|---|
| Default | `CachingOptimized` | SPA bisa dikompres. `index.html` diinvalidasi saat deploy FE (architecture.md §12.6) |
| `/media/*`, `/posters/*` | `CachingOptimizedForUncompressedObjects` | Video dan JPEG tidak perlu dikompres. Cache key tanpa cookie, query string, dan header, jadi semua peserta memakai cache yang sama (NFR-1.8) |

ID policy diambil dari [Use managed cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html) (**verified (AWS docs)**, dicek 19 Nov 2026). TTL efektif mengikuti header `Cache-Control: public, max-age=31536000, immutable` yang dipasang script publish.

## Input

| Variabel | Wajib | Default | Keterangan |
|---|---|---|---|
| `project_name`, `env` | Ya | — | Sumber semua nama |
| `app_domain` | Ya | — | Contoh `watchparty.chescloud.my.id` |
| `acm_certificate_arn` | Tidak | `null` | Sertifikat ACM **`us-east-1`** dari modul `dns`. Jika `null`, distribution memakai domain `*.cloudfront.net` |
| `route53_zone_id` | Tidak | `null` | Hosted zone `app_domain` |
| `signing_public_key_path` | Tidak | `keys/cloudfront-signing-public.pem` | |
| `price_class` | Tidak | `PriceClass_200` | |
| `content_security_policy` | Tidak | `""` | Disepakati Platform + FE sebelum diisi |
| `catalog_table_arn` | Tidak | `null` | ARN tabel `main`. Jika diisi, policy publisher boleh menulis item katalog |
| `tags` | Tidak | `{}` | Default tags tetap dari provider di `envs/prod` |

## Output

`distribution_id`, `distribution_arn`, `distribution_domain_name`, `web_bucket_name`, `web_bucket_arn`, `media_bucket_name`, `media_bucket_arn`, `cloudfront_public_key_id`, `media_key_group_id`, `media_publisher_policy_arn`, `app_url`.

## Wiring di `envs/prod` (dikerjakan Platform)

Modul ini **belum** dipasang di `envs/prod/main.tf`. Signed cookies hanya berfungsi di domain aplikasi (`Domain=<app_domain>`), jadi pasang modul ini setelah sertifikat ACM `us-east-1` tersedia.

```hcl
module "edge" {
  source              = "../../modules/edge"
  project_name        = var.project_name
  env                 = var.env
  app_domain          = var.app_domain
  acm_certificate_arn = module.dns.cloudfront_certificate_arn # modul dns (Platform)
  route53_zone_id     = module.dns.zone_id
  catalog_table_arn   = module.data.main_table_arn
  tags                = var.tags
}

# Di module "api": isi Key-Pair-Id untuk signed cookies.
#   cloudfront_key_pair_id = module.edge.cloudfront_public_key_id

# Policy publisher ke grup IAM RTC/Media.
resource "aws_iam_group_policy_attachment" "media_publisher" {
  group      = "watchparty-rtc-media"
  policy_arn = module.edge.media_publisher_policy_arn
}
```

## Validasi

```bash
terraform -chdir=infra/terraform/modules/edge init -backend=false
terraform -chdir=infra/terraform/modules/edge validate
terraform fmt -check -recursive infra/
```

Hasil 19 Nov 2026: `fmt -check` OK, `validate` OK (Terraform 1.17.1, provider AWS 6.73.0), `tflint` v0.66.0 tanpa temuan (ruleset terraform preset `all` + ruleset AWS 0.50.0). Logika `functions/spa-routing.js` dites dengan Node untuk `/`, `/r/<roomId>`, `/callback`, `/assets/*.js`, `/favicon.svg`.

## Cek setelah apply

```bash
# Film tanpa cookie harus 403 (AC-2.3.3, NFR-3.3)
curl -sI https://<app_domain>/media/sintel/master.m3u8 | head -1

# Poster publik harus 200
curl -sI https://<app_domain>/posters/sintel.jpg | head -1

# Deep link SPA harus 200 berisi index.html (AC-6.1.3)
curl -s -o /dev/null -w '%{http_code}\n' https://<app_domain>/r/aZ3kP9qL2mXw

# HTTP harus redirect ke HTTPS (AC-6.1.2)
curl -sI http://<app_domain>/ | head -1
```

## Rotasi key signed cookies

1. Buat key pair baru (runbook bootstrap §7), timpa parameter SSM private key, ganti `keys/cloudfront-signing-public.pem` lewat PR.
2. `terraform apply`: public key baru dibuat dulu (`create_before_destroy`), key group diperbarui, lalu key lama dihapus. Env `CLOUDFRONT_KEY_PAIR_ID` di Lambda `rest-api` ikut berubah.
3. Cookie lama tidak berlaku lagi. Client meminta cookie baru saat mendapat 403 atau saat refresh 90 menit.

## Catatan

- `terraform destroy` gagal jika bucket masih berisi objek. Kosongkan dulu: `aws s3 rm s3://<bucket> --recursive`.
- Biaya: CloudFront dan S3 masuk kuota gratis untuk skala demo (architecture.md §11). Distribution memakai harga pay-as-you-go (default Terraform), bukan paket flat-rate.
