# Dental Coass Master Dashboard & Clinical Tracker

## Original problem statement
Build a full-stack web application for dental clinical students (koas) with requirement tracking, patient logbook and interactive odontogram, clinical media comparison, Gemini AI assistant, calendar/reminders/supervisor log, treatment timeline and form/export utilities, SOP and drug-safety references, inventory and expense tracking, plus Google Drive OAuth 2.0 for secure media/PDF backup.

## Product decisions
- Audience: Indonesian dental clinical students who need a fast, calm workspace during clinic sessions.
- Architecture: React frontend, FastAPI backend, MongoDB metadata and records.
- Auth: Emergent-managed Google OAuth with a server-side session exchange and httpOnly cookie.
- AI: Gemini Flash for chat/SOAP and Gemini Pro for treatment-plan analysis through Emergent managed LLM access; responses stream over SSE.
- Storage: Emergent object storage for private media, with MongoDB file metadata and soft-delete semantics.
- Drive: Google Drive OAuth 2.0 using `drive.file`; each connected user gets or reuses a `Dental Coass Tracker` folder.
- Privacy: demo patients are anonymous; APIs require the authenticated user; no real patient data should be used during testing.

## Implemented (2026-09-28)
- Branded responsive login screen and Emergent Google sign-in callback flow.
- Dashboard with UKMP2DG countdown, overall progress, department tracker, agenda and patient navigation.
- Patient logbook with anonymous demo cases, tags, reliability colors, WhatsApp action and interactive odontogram status toggling.
- Private file upload/download/list APIs for images and PDFs with 15 MB validation and protected object-storage paths.
- Gemini AI workspace with chat discussion, SOAP draft and treatment plan modes, streamed responses and clinical safety disclaimer.
- Settings integration entry point and complete Google Drive OAuth connect/callback/status flow.
- Automatic Drive folder creation and background sync of newly uploaded clinical files when Drive is connected.
- Public API and unauthenticated route regression coverage.

## Remaining backlog
### P0
- Complete a real Google OAuth callback with a configured test Google account.
- Add authenticated end-to-end tests for dashboard, odontogram persistence, AI streaming, object storage upload and Drive sync.

### P1
- Replace the compact calendar/library/inventory screens with CRUD views and persist reminders, supervisor notes, stock and expenses.
- Add patient timeline, consent/post-op templates and PDF/Excel export.
- Add contraindication rule engine and SOP/journal CRUD.

### P2
- Add role-based supervisor access, audit log, file retention controls and encrypted credential storage at rest.
- Add richer before/after media labeling and radiograph comparison annotations.

## Next tasks
1. Sign in with a Google test identity and connect Drive from Settings.
2. Upload an anonymous image and confirm it appears in the `Dental Coass Tracker` Drive folder.
3. Expand the remaining feature pages into persisted CRUD flows.