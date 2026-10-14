# Changelog — Ruang (ridha-hq)

All notable changes to this project are documented in this file.

## [0.4.0] — 2026-10-14

### Added
- **Org Flow → tab "Agent & Cron" (default):** status tiap role (bekerja / ada tiket / diam), profile runtime yang dipakai (target 1 role = 1 profile = 1 agent, ditandai bila profile dipakai bersama), cron per role, daftar role tanpa cron, dan tabel semua cron job (jadwal, run berikutnya, status terakhir, role pemakai).
- **Deteksi cron sedang jalan:** baca read-only ledger `cron/executions.db` (status `claimed`/`running`); role dianggap "bekerja" bila punya tiket running atau cron-nya sedang jalan.

### Changed
- **Ruang 3D (Office) diarsipkan:** keluar dari menu; halaman utama kini Org Flow. Masih bisa dibuka lewat `#/office`, kode tidak dihapus.

## [0.3.0] — 2026-10-13

### Added
- **Halaman Org Flow (`#/org-flow`):** dokumentasi interaktif alur kerja multi-agent RDK.
  - **Peta Organisasi (L1):** graph relasi 22 role RDK dalam 5 meja (Manajemen, Produksi, Marketing, Logistik, Intelijen Pasar) + Owner (Tony) + sistem pendukung. Mendukung toggle garis serah terima, eskalasi, dan garis atasan.
  - **Alur SOP (L2):** diagram swimlane bergaya BPMN-lite untuk 6 SOP resmi (SOP-00 s/d SOP-05) dengan pilihan swimlane per-role atau per-meja, plus narasi langkah otomatis.
  - **Kasus End-to-End:** rangkaian lintas-SOP (Order B2B, Pembelian Bahan Baku, Komplain, Produksi Harian).
  - **Kenyataan & Kinerja Live:** data riil dari `kanban.db` diperbarui otomatis tiap 30 detik.
    - Metrik per role: efektivitas (bobot 60% otonomi tanpa intervensi, 25% bebas gagal, 15% selesai), beban kerja relatif, tiket 30 hari, waktu rata-rata, durasi nganggur (ambang 7 hari untuk role harian, 30 hari untuk role kejadian).
    - Daftar tiket sedang berjalan beserta heartbeat dan alasan blocker.
    - Analisis *drift*: handoff yang terjadi di kanban tapi belum dideklarasikan di SOP, dan handoff di SOP yang belum pernah terlaksana di kanban.
    - Audit celah: skill yang hilang di profile, role tanpa SOP, kontrak tanpa data contract / eskalasi, cron yang tidak terdaftar.
  - **Due Diligence Register:** daftar 16 temuan pertentangan SOP vs kontrak role (pro, kontra, rekomendasi, status) yang siap diputuskan bersama owner.
  - **Panel Detail Role (L3):** drill-down interaktif saat role diklik (Ringkasan, Alur Internal L3, Relasi Serah Terima & Eskalasi, Skill & Pemicu Cron, Kinerja Live, Kontrak Asli).
- **Endpoint `GET /api/orgflow`:** agregasi deterministik dari frontmatter vault Obsidian (`workflow:` block), `~/.hermes/kanban.db`, dan jadwal cron jobs. Cache in-memory 10 detik.
- **Dependency baru:** `@xyflow/react` v12 (React Flow) dan `js-yaml` v4.

### Changed
- Menaikkan `API_VERSION` dari 11 ke 12 (server dan client).
- Navigasi drawer memuat menu baru **Org Flow** di posisi ketiga.
