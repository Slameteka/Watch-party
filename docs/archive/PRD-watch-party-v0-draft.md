# Product Requirements Document (PRD)
## Layanan Streaming Film Tersinkronisasi dan Komunikasi Video Real-Time Berbasis Cloud

**Versi Dokumen:** 1.0 (Draft)  
**Tanggal:** 27 Oktober 2026  
**Status:** Draft Awal  
**Tim:** 6 Anggota

---

## 1. Ringkasan Eksekutif

Proyek ini bertujuan membangun platform berbasis web yang memungkinkan pengguna menonton film secara bersamaan (watch party) dengan sinkronisasi pemutaran yang presisi, disertai fitur komunikasi video real-time (seperti Zoom) untuk interaksi sosial selama menonton. Infrastruktur dibangun di atas AWS dengan pendekatan serverless dan managed services untuk skalabilitas dan efisiensi biaya.

---

## 2. Latar Belakang & Masalah

- Menonton film sendirian terasa kurang sosial, terutama bagi LDR atau teman yang berjauhan.
- Solusi watch party yang ada saat ini seringkali memiliki latensi sinkronisasi tinggi, kualitas video buruk, atau tidak memiliki fitur komunikasi video terintegrasi (harus buka aplikasi terpisah seperti Zoom/Discord).
- Pengguna menginginkan pengalaman "nonton bareng di sofa" yang bisa direplikasi secara digital dengan mulus.

---

## 3. Tujuan & Sasaran

### 3.1 Tujuan Produk
- Menyediakan pengalaman menonton film bersama secara real-time dengan sinkronisasi < 500ms.
- Mengintegrasikan komunikasi video/audio real-time langsung di dalam platform.
- Memberikan pengalaman web-based yang ringan tanpa instalasi aplikasi.

### 3.2 Sasaran Kuantitatif (MVP)
- Latensi sinkronisasi antar peserta: < 500ms.
- Latensi audio/video chat: < 300ms.
- Support minimal 10 peserta per ruangan.
- Uptime sistem: 99%.
- Waktu loading film awal: < 3 detik.

---

## 4. Target Pengguna (User Personas)

### Persona 1: Andi (25 tahun, Karyawan)
- Ingin nonton film bareng teman-teman kampus yang sudah tersebar di berbagai kota.
- Butuh platform yang simpel, tidak ribet, dan bisa langsung jalan.

### Persona 2: Bella (20 tahun, Mahasiswa LDR)
- Ingin menonton film bareng pacarnya yang berada di luar negeri.
- Butuh fitur video call agar bisa melihat ekspresi pacarnya saat adegan penting.

### Persona 3: Community Host (Organisator Komunitas Film)
- Ingin mengadakan nonton bareng online untuk anggota komunitasnya.
- Butuh fitur manajemen ruangan dan kontrol penuh sebagai host.

---

## 5. Fitur Produk

### 5.1 Fitur Inti (Core Features)

#### F1. Manajemen Ruangan (Room Management)
- **F1.1** Buat ruangan baru dengan memilih film dari katalog.
- **F1.2** Generate link unik untuk berbagi ke peserta.
- **F1.3** Join ruangan via link (tanpa wajib login untuk guest).
- **F1.4** Daftar peserta aktif di ruangan.
- **F1.5** Host control: kick peserta, tutup ruangan.

#### F2. Video Player Tersinkronisasi
- **F2.1** Play, Pause, Seek (geser timeline).
- **F2.2** Kontrol volume dan fullscreen.
- **F2.3** Sinkronisasi otomatis: aksi host (play/pause/seek) tercermin ke semua peserta.
- **F2.4** Indikator status: "Buffering", "Syncing", "Ready".
- **F2.5** Quality selector (360p, 480p, 720p, 1080p).

#### F3. Komunikasi Video Real-Time
- **F3.1** Nyalakan/matikan kamera (video toggle).
- **F3.2** Nyalakan/matikan mikrofon (mute/unmute).
- **F3.3** Grid view peserta (2x2, 3x3, atau spotlight).
- **F3.4** Indikator kualitas jaringan per peserta.
- **F3.5** Pilih device input (kamera & mic).

#### F4. Chat Teks & Reaksi
- **F4.1** Chat teks real-time di sidebar.
- **F4.2** Emoji reactions (👍 ❤️ 😂 😮 😢) yang muncul overlay di layar.

### 5.2 Fitur Pendukung
- **F5.1** Katalog film dengan search & filter genre.
- **F5.2** Riwayat ruangan yang pernah dikunjungi.
- **F5.3** Notifikasi browser untuk event ruangan.
- **F5.4** Dark mode UI.

---

## 6. User Stories

### Epic 1: Room Management
- **US-1.1** Sebagai user, saya ingin membuat ruangan baru agar bisa mengundang teman menonton bareng.
- **US-1.2** Sebagai user, saya ingin join via link agar tidak perlu ribet mencari ruangan.
- **US-1.3** Sebagai host, saya ingin kick peserta yang mengganggu agar suasana tetap nyaman.

### Epic 2: Sinkronisasi Film
- **US-2.1** Sebagai peserta, saya ingin video otomatis tersinkron saat host menekan play/pause agar tidak ketinggalan adegan.
- **US-2.2** Sebagai peserta, saya ingin tahu jika video saya tidak sinkron agar bisa melakukan refresh.

### Epic 3: Komunikasi Video
- **US-3.1** Sebagai peserta, saya ingin menyalakan kamera agar bisa melihat ekspresi teman saat menonton.
- **US-3.2** Sebagai peserta, saya ingin mute mic agar suara latar saya tidak mengganggu.

### Epic 4: Interaksi Sosial
- **US-4.1** Sebagai peserta, saya ingin mengirim chat teks agar bisa berdiskusi tanpa memutus fokus video.
- **US-4.2** Sebagai peserta, saya ingin mengirim emoji reaction agar bisa merespon adegan dengan cepat.

---

## 7. System Design

### 7.1 Arsitektur High-Level

```text
[ WEB BROWSER ]
│
├───(1) Streaming Film ───▶ [ CloudFront CDN ] ──▶ [ S3 Bucket ]
│
├───(2) Sinkronisasi ────▶ [ API Gateway WS ] ──▶ [ Lambda ] ───▶ [ ElastiCache Redis ]
│                                                       │
│                                                       ▼
│                                                 [ DynamoDB ]
│
└───(3) Video Chat ────────▶ [ Amazon Chime SDK ] ───▶ [ Chime Media Servers ]
```

### 7.2 Komponen AWS

| Layanan | Fungsi | Justifikasi |
|---------|--------|-------------|
| **Amazon S3** | Penyimpanan file film | Murah, scalable, terintegrasi CloudFront |
| **Amazon CloudFront** | CDN distribusi film | Latensi rendah ke seluruh dunia |
| **Amazon API Gateway** | REST & WebSocket endpoint | Managed, auto-scaling |
| **AWS Lambda** | Backend logic | Serverless, bayar per usage |
| **Amazon DynamoDB** | Database ruangan & user | NoSQL, latency rendah |
| **ElastiCache Redis** | Pub/Sub sinkronisasi real-time | In-memory, sangat cepat |
| **Amazon Chime SDK** | WebRTC video/audio chat | Managed WebRTC, hemat biaya dev |

### 7.3 Alur Data

**Alur Sinkronisasi:**
1. User A tekan "Pause" → Frontend kirim event ke WebSocket.
2. API Gateway → Lambda → Redis Pub/Sub.
3. Redis broadcast ke semua subscriber di room tersebut.
4. Frontend User B, C, D terima event → execute `video.pause()`.

**Alur Video Chat:**
1. User klik "Nyalakan Kamera" → Frontend minta token ke Lambda.
2. Lambda generate token Chime → return ke frontend.
3. Frontend init Amazon Chime SDK → connect ke Chime media server.
4. Audio/video stream langsung peer-to-peer via Chime.

---

## 8. Tech Stack

### Frontend
- **Framework:** React.js + Vite
- **Video Player:** Video.js / Plyr
- **WebRTC:** amazon-chime-sdk-js
- **State Management:** Zustand / Redux Toolkit
- **Styling:** Tailwind CSS
- **Real-time Client:** Socket.io-client

### Backend
- **Runtime:** Node.js 20 LTS
- **Framework:** Express.js (di Lambda)
- **WebSocket:** Socket.io + API Gateway WebSocket
- **Database:** DynamoDB (via AWS SDK)
- **Cache:** Redis (ioredis)
- **Auth:** JWT + AWS Cognito

### Infrastructure
- **IaC:** AWS CDK (TypeScript)
- **CI/CD:** GitHub Actions
- **Monitoring:** CloudWatch + X-Ray

---

## 9. Pembagian Tugas Tim (6 Orang)

| Role | Fokus Utama | Deliverables |
|------|-------------|--------------|
| **FE 1 - Video & UI** | Video player, layout, sinkronisasi UI | Komponen player, progress bar, UI ruangan |
| **FE 2 - Real-time & AV** | Chime SDK, WebSocket client, grid kamera | Integrasi kamera/mic, event listener sync |
| **BE 1 - API & Auth** | REST API, CRUD, autentikasi | Endpoint auth, rooms, catalog |
| **BE 2 - WebSocket & Sync** | WebSocket server, Redis Pub/Sub | Broadcast engine, concurrency handling |
| **Cloud / DevOps** | AWS setup, CI/CD, monitoring | IaC, pipeline, environment dev/prod |
| **Product / UI-UX / QA** | Desain, user flow, testing | Figma mockup, PRD detail, test cases |

---

## 10. Non-Functional Requirements

### 10.1 Performance
- Waktu load halaman awal: < 2 detik.
- Latensi sinkronisasi: < 500ms (95th percentile).
- Latensi audio/video: < 300ms.
- Support 10 peserta per room (MVP), target 50 (v2).

### 10.2 Scalability
- Sistem harus auto-scale saat traffic meningkat.
- CloudFront cache hit ratio > 90%.

### 10.3 Security
- HTTPS only.
- JWT token untuk autentikasi API.
- Signed URL untuk akses video di S3 (mencegah pembajakan).
- Input sanitization untuk mencegah XSS.

### 10.4 Reliability
- Uptime target: 99%.
- Graceful degradation: jika Chime down, film tetap bisa ditonton.
- Auto-reconnect WebSocket jika putus.

### 10.5 Compatibility
- Browser: Chrome, Firefox, Safari, Edge (2 versi terakhir).
- Responsive: Desktop & Tablet (mobile sebagai secondary).

---

## 11. Success Metrics

| Metrik | Target MVP |
|--------|------------|
| Latensi sync (p95) | < 500ms |
| Latensi AV chat (p95) | < 300ms |
| Crash-free session | > 98% |
| User retention (7 hari) | > 30% |
| Rata-rata durasi sesi | > 45 menit |

---

## 12. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|--------|--------|----------|
| Latensi sync tinggi | UX buruk | Gunakan Redis Pub/Sub, optimasi event debounce |
| Biaya AWS membengkak | Budget jebol | Monitor cost daily, set budget alert, batasi resolusi |
| Chime SDK kompleks | Dev lambat | Assign FE khusus, pelajari dokumentasi di minggu 1 |
| Browser compatibility | Fitur tidak jalan | Testing cross-browser rutin, gunakan polyfill |
| Video buffering | UX buruk | Optimasi bitrate, gunakan adaptive streaming (HLS) |
| Concurrent user tinggi | Server down | Load testing di staging, auto-scaling Lambda |

---

## 13. Milestone (High-Level)

- **M1 - Setup & Kontrak:** Infrastruktur AWS siap, API contract disepakati, UI mockup final.
- **M2 - Core Streaming:** Video player jalan, sinkronisasi basic berfungsi (play/pause).
- **M3 - Video Chat:** Kamera/mic terintegrasi, grid view berfungsi.
- **M4 - Integrasi Penuh:** Semua fitur terhubung, testing end-to-end.
- **M5 - Launch MVP:** Deploy ke production, monitoring aktif.

---

## 14. Open Questions

- [ ] Apakah perlu fitur "raise hand" untuk host?
- [ ] Apakah guest harus login atau bisa anonim?
- [ ] Apakah film disediakan sendiri atau dari sumber eksternal (YouTube embed)?
- [ ] Apakah perlu fitur recording sesi untuk ditonton ulang?
- [ ] Bagaimana kebijakan hak cipta film yang di-stream?

---

## 15. Lampiran

### 15.1 Glossary
- **Watch Party:** Sesi menonton film bersama secara online.
- **Sync:** Sinkronisasi pemutaran video antar peserta.
- **Host:** Pemilik/pembuat ruangan yang punya kontrol penuh.
- **Guest:** Peserta yang join via link.
- **Latency:** Jeda waktu antara aksi dan respons.

### 15.2 Referensi
- [Amazon Chime SDK Documentation](https://docs.aws.amazon.com/chime/)
- [Video.js Documentation](https://videojs.com/)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)

---

**Dibuat oleh:** [Nama Anda]  
**Direview oleh:** [Tim]  
**Disetujui oleh:** [Stakeholder]
