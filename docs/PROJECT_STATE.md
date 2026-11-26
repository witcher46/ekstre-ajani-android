# Android project state — compact entry point

Baseline audited on 21–22 Nov 2026; report completed 24 Nov:
- Repository: witcher46/ekstre-ajani-android. Audited main: aae505b3c7a01a416bb9059c442f0161e167f00e; tree: 06cf6f25b455dee7a2d4d4857ac71cd2cedac6cf.
- Check actual branch/HEAD before work. This is an audited baseline, not an assertion about the latest commit.
- PR #24: reconciliation phase 2 (evidence, CAS, approval/history). PR #25: category suggestions and actual installed version label. Both merged at baseline.
- Local-first Java Android shell + WebView assets; JS integer-kuruş finance core; SQLite JSON snapshot storage (current/previous/recovery). Supported JSON v1/v2/v3. No automatic bank connection.
- Prior physical test: isolated test APK passed accounts, ordinary finance, mismatch observation, incomplete evidence rejection, basic UI/privacy and synthetic JSON roundtrip. Valid approval/history, TalkBack and real production-signed upgrade remain open.
- The independent audit confirmed 24 findings and found the project unready for production. The full audit PDF and raw evidence are owner-local. Ask only for the specific missing evidence if needed. Never upload actual financial records.

Accepted remediation as of 26 Nov 2026 — **24/24 findings closed at code and CI level.** [Audit tracker and closure evidence](AUDIT_TRACKER.md)

- The project remains unready for production release. Acceptance still requires valid reconciliation approval/history and freshness, physical TalkBack, IME, low-memory/device lifecycle and supported WebView checks, actual bank template coverage, and genuine production signing/package continuity with a safe in-place upgrade on an isolated acceptance device. Full applicable CI and independent critical-fix review also remain release gates. New features and production release remain paused.

Read only what the task needs:
- Financial rules: FINANCIAL_BEHAVIOR_CONTRACT.md
- Data formats: DATA_FORMATS_AND_MIGRATIONS.md
- Reconciliation: ANDROID_ACCOUNT_BALANCE_RECONCILIATION_PHASE_2_ACCEPTANCE.md and related phase documents
- Distribution: ANDROID_DISTRIBUTION.md
- Findings: AUDIT_TRACKER.md
Historical progress.md, findings.md and old Superpowers plans are historical, not the current acceptance checklist.

Update this file only for material architecture or acceptance changes; update the audit tracker when a finding is verified closed or formally reclassified.
