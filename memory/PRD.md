# Dental Coass Master Dashboard & Clinical Tracker

## Original problem statement
Full-stack web app "Dental Coass Master Dashboard & Clinical Tracker" untuk mahasiswa klinik (koas) kedokteran gigi. Fitur inti: Dashboard & Requirement Tracker per departemen (8 dept), Logbook + Odontogram interaktif FDI, Media comparer (before/after + xray pre/post), WhatsApp direct button, Gemini AI (Case discussion, SOAP note, Treatment plan), Kalender + Supervisor Log + Reminder, Form generator + Export PDF/Excel, SOP library + Drug safety alerts + Journal bookmarks, Inventory (Dental Kit) + Expense tracker, Google Drive OAuth 2.0.

## Product decisions
- Bahasa: Indonesian.
- Auth: Emergent-managed Google Sign-in + httpOnly session cookie.
- AI: Gemini 3 Flash (chat/SOAP) + Gemini 3.1 Pro (treatment plan) via Emergent LLM Key.
- Storage: Emergent object storage untuk foto/PDF, Mongo untuk metadata.
- Google Drive: OAuth `drive.file` scope, auto folder "Dental Coass Tracker".
- Odontogram: FDI two-digit notation (permanent 11-48 + primary 51-85), multi-status per tooth.

## Implemented (2026-09-28 · iteration 3)
- Interactive **Odontogram FDI** (permanent + primary teeth, toggle sulung, popover multi-status: Sound, Caries, Restored, RCT, Missing, Crown, Bridge, Implant, Fractured, Sealant, Extraction, Impacted). Persist ke Mongo per pasien.
- Full **Patient CRUD** dengan medical history, allergies, notes editor + inline tag add/remove.
- **Drug safety engine**: 11 aturan (Hipertensi, Kehamilan, DM, Alergi Penisilin/Lateks, Asma, Antikoagulan, Penyakit Jantung, Epilepsi, Ginjal, Bifosfonat) — auto-alert di profil pasien; endpoint `/api/safety/check` & `/api/safety/rules`.
- **Kalender** interaktif month grid + tambah/hapus event + toggle done; **Supervisor Log** dengan WA link; **Reminder** to-do CRUD.
- **Library**: SOP (seeded 4 default, CRUD dengan filter kategori & search) + Journal Bookmarks (seeded 2, CRUD) + Drug Safety reference view.
- **Media comparer**: 4 slot (Before / After / X-ray Pre / X-ray Post) upload ke object storage + auto-sync ke Google Drive.
- **WhatsApp** wa.me link dengan pesan template.
- **Inventory** & **Expense** tracker CRUD.
- Dental AI (Gemini) SSE stream — Chat / SOAP / Treatment plan.
- Dashboard countdown UKMP2DG + progress overall + agenda hari ini.
- Semua endpoint auth-gated dengan cookie httpOnly.

## Personas
- Koas kedokteran gigi Indonesia yang butuh tracker requirement, logbook pasien, dan draft SOAP/treatment sebelum bimbingan.

## Backlog
### P0
- Real Google OAuth callback test dengan akun test Google.
- Form Generator (Consent form + Post-op instruction PDF) + Export rekap requirement PDF/Excel.
### P1
- Timeline/tahap tindakan per kunjungan di profil pasien.
- Modul catatan revisi/bimbingan per supervisor per pasien.
- Radiograph annotation & side-by-side overlay slider.
### P2
- Role-based supervisor dashboard.
- Encrypt Drive refresh_token at rest.
- Split server.py into router modules (patients.py, library.py, drive.py).
- Extract Odontogram/MediaComparer/AddPatientDialog/SafetyAlerts into own files.

## Next tasks
1. Form generator (consent + post-op) → PDF export.
2. Export rekap requirement PDF/Excel.
3. Timeline tindakan per kunjungan.
