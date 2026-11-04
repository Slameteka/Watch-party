# ADR-0007: Model Autentikasi

| Atribut | Nilai |
|---|---|
| Status | Proposed |
| Tanggal | 2026-10-31 |
| Pemilik | Backend |
| Terkait | F-1.3, F-1.4, F-1.6, F-2.2, F-2.3, F-3.x; NFR-3.3, NFR-3.4; ADR-0003, ADR-0005 |

## Konteks

- Draft v0 menulis "JWT + AWS Cognito" tanpa menjelaskan hubungannya, sehingga terlihat seperti dua sistem auth yang tumpang tindih.
- Guest harus bisa join **tanpa akun** (hanya display name). Host perlu identitas agar bisa kembali sebagai host dan agar pembuatan room tidak bisa disalahgunakan secara anonim.
- WebSocket di browser tidak bisa mengirim header `Authorization`, jadi token harus lewat query string saat `$connect`.
- Peran di room (`host`, `controller`, `viewer`) bisa berubah kapan saja (grant/revoke, kick).
- Secret harus murah dan tidak boleh ada di repo public.

## Keputusan

Ada **dua lapis dengan tugas berbeda**, tidak tumpang tindih:

1. **Amazon Cognito user pool = identitas host.** Hanya host (pembuat room) yang login, lewat Cognito managed login (OAuth 2.0 authorization code + PKCE, app client publik tanpa secret, domain prefix Cognito). Access token Cognito hanya dipakai di:
   - `POST /rooms` (wajib, divalidasi JWT authorizer HTTP API);
   - `POST /rooms/{roomId}/join` (opsional, divalidasi di kode lewat JWKS Cognito) agar host yang kembali mendapat `participantId` host yang sama.
2. **Room token = kredensial di dalam room untuk semua peserta.** JWT jangka pendek (HS256, TTL 4 jam) yang diterbitkan backend saat create/join/refresh. Claim: `iss`, `aud = room`, `sub = participantId`, `roomId`, `iat`, `exp`, `jti`. Dipakai untuk WebSocket `$connect` (query string, divalidasi Lambda authorizer) dan semua endpoint REST di dalam room (media cookies, rtc token, grant/revoke, kick, close, refresh).
3. **Peran tidak ada di token.** Peran dibaca dari DynamoDB setiap aksi terlindungi, sehingga grant/revoke/kick langsung berlaku tanpa menunggu token expired.
4. **Signing key** room token disimpan di **SSM Parameter Store SecureString** (`/<project_name>/<env>/room-token-signing-key`), dibuat manual lewat runbook. SSM dipilih daripada Secrets Manager karena standard parameter gratis.
5. Guest bersifat anonim: hanya display name yang disimpan.

## Alternatif yang Dipertimbangkan

| Alternatif | Kelebihan | Kekurangan | Alasan ditolak |
|---|---|---|---|
| Semua peserta wajib login Cognito | Satu jenis token; kick permanen | Guest harus daftar akun; melanggar F-1.3 | Friksi untuk guest |
| Cognito identity pool (guest unauthenticated) | Managed | Memberi kredensial AWS ke browser; tidak memberi identitas room; lebih rumit | Tidak perlu akses AWS langsung dari browser |
| Peran disimpan di claim token | Tidak perlu baca DB | Grant/revoke/kick tidak berlaku sampai token expired | Tidak memenuhi AC-2.2.3 dan AC-1.6.3 |
| Room token RS256 dengan key pair | Verifikasi bisa dengan public key | Lebih rumit; semua verifier ada di backend sendiri | HS256 cukup karena penerbit dan verifier sama |
| Secrets Manager untuk signing key | Rotasi bawaan | Biaya per secret per bulan | SSM SecureString gratis dan cukup |
| Tanpa token, hanya `roomId` di link | Paling sederhana | Tidak ada identitas peserta; tidak bisa otorisasi peran | Tidak aman |

## Konsekuensi

- **Positif:** guest tanpa friksi; host punya identitas; satu jenis kredensial untuk semua aksi di room; perubahan peran langsung berlaku.
- **Negatif / trade-off:**
  - Peserta yang di-kick bisa join lagi sebagai guest baru lewat link yang sama (batasan v1, dicatat di PRD US-1.6).
  - Token di query string WebSocket bisa tercatat di log jika salah konfigurasi. Mitigasi: format access log tanpa query string; TTL token pendek.
  - Setiap aksi terlindungi butuh satu GetItem DynamoDB untuk membaca peran (latensi kecil, diterima).
  - Email bawaan Cognito terbatas (±50/hari, prior knowledge, unverified), cukup untuk verifikasi akun host saat demo.
- **Tindak lanjut:** library validasi token bersama di `backend/src/core/` dipakai oleh `rest-api` dan `ws-authorizer`; unit test untuk token expired, `roomId` salah, peserta kicked.

## Verifikasi

| Klaim | Status | Sumber |
|---|---|---|
| HTTP API mendukung JWT authorizer untuk Cognito | prior knowledge, unverified | [HTTP API JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html) |
| WebSocket API mendukung Lambda REQUEST authorizer dengan identity source query string pada `$connect` | prior knowledge, unverified | [WebSocket API Lambda authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-lambda-auth.html) |
| Browser WebSocket API tidak bisa set header custom (constructor hanya menerima `url` dan `protocols`) | verified (sumber pihak ketiga) | [WHATWG WebSockets Standard](https://websockets.spec.whatwg.org/), [MDN WebSocket()](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket) |
| SSM Parameter Store standard parameter tanpa biaya | prior knowledge, unverified | — |
| Cognito Lite/Essentials gratis ≤ 10.000 MAU | prior knowledge, unverified | — |
| Cognito user pool tersedia di `ap-southeast-1` | verified (AWS docs) | [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/) |
