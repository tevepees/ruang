# PRD — Ruang / ridha-hq (v0.4.0+, rev. 1, 2026-11-10)

Versi PRD mengikuti `CHANGELOG.md`. Dokumen ini mencatat apa yang **sudah ada**; fitur baru wajib ditulis di sini sebelum kode (SOP-01 Gerbang 0).

## 1. Tujuan
Mission control **read-only** untuk crew Hermes RDK: lihat siapa bekerja, tiket Kanban, cron, sesi, memory, folder, log, dan alur organisasi — dalam satu tempat, tanpa mengubah apa pun.

## 2. Asal & kepemilikan
- Fork dari `yugienugraha/ruang` (MIT). Remote kita: `git@github.com:tevepees/ruang.git`.
- Berjalan di homelab: `bin/ruang.js --port 3000`, bind `127.0.0.1` saja. Akses jarak jauh lewat SSH tunnel.
- Semua data dibaca lewat CLI `hermes` dan berkas profil. Nol tulis.

## 3. Prinsip (tidak boleh dilanggar)
1. **Read-only.** Tidak ada endpoint yang mengubah Hermes, Kanban, cron, atau vault.
2. **Terkurung folder agent.** Folder/Memory hanya dalam `~/.hermes/profiles/<name>`; teks bebas di-redact dari secret.
3. **Localhost saja** (`127.0.0.1`). Kode akses dan profile lock opsional.

## 4. Halaman (kondisi nyata)
- **Org Flow** (halaman utama sejak 0.4.0): Peta Organisasi 22 role / 5 meja, Alur SOP-00..05 (swimlane), kasus end-to-end, tab **Agent & Cron** (status role, profile, cron, deteksi cron berjalan dari `cron/executions.db`). Sumber: `server/orgflow.ts`, vault di `RUANG_VAULT` (default `~/Projects/second-brain-2/vault`).
- **Office** (`#/office`): kantor 3D/2D; 5 klaster divisi + 2 ruang rapat (Boardroom, War Room); 25 stasiun dengan nama persona dan peran (mis. Ridha — Butler). Diarsipkan dari menu di 0.4.0, dibuka kembali lewat commit `bbb07d5` (belum tercatat di CHANGELOG).
- **Tasks** (Kanban semua board), **Calendar** (cron), **Activity** (20 sesi), **Memory**, **Folders**, **Logs**, **Settings** (kode akses, profile lock).

## 5. API (server/index.ts)
`GET /api/health`, `/api/usage`, `/api/memory`, `/api/tasks/:id`, `/api/folders`, `/api/folders/:profile/list`, `/api/folders/:profile/file`, plus snapshot mission-control dan orgflow. Semua GET.

## 6. Uji & rilis
- `npm run lint`, `npm test`, `npm run build`.
- Rilis: `npm version X && git push origin main --follow-tags`.

## 7. Utang dokumen / non-goal
- Commit 2026-10-21..27 (path vault, unarchive office, persona nama, klaster divisi) belum ada entri CHANGELOG; versi masih `0.4.0`.
- README masih menautkan installer ke repo upstream `yugienugraha/ruang`, bukan fork kita.
- Non-goal: tombol aksi (restart agent, kirim pesan, edit task). Bila diminta, wajib revisi PRD + persetujuan Tony karena melanggar prinsip 1.
