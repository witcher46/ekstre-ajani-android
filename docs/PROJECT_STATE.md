# Android project state — compact entry point

Baseline audited on 21–22 Nov 2026; report completed 24 Nov:
- Repository: witcher46/ekstre-ajani-android. Audited main: aae505b3c7a01a416bb9059c442f0161e167f00e; tree: 06cf6f25b455dee7a2d4d4857ac71cd2cedac6cf.
- Check actual branch/HEAD before work. This is an audited baseline, not an assertion about the latest commit.
- PR #24: reconciliation phase 2 (evidence, CAS, approval/history). PR #25: category suggestions and actual installed version label. Both merged at baseline.
- Local-first Java Android shell + WebView assets; JS integer-kuruş finance core; SQLite JSON snapshot storage (current/previous/recovery). Supported JSON v1/v2/v3. No automatic bank connection.
- Prior physical test: isolated test APK passed accounts, ordinary finance, mismatch observation, incomplete evidence rejection, basic UI/privacy and synthetic JSON roundtrip. Valid approval/history, TalkBack and real production-signed upgrade remain open.
- Independent audit decision: not production-ready. 24 confirmed findings in docs/AUDIT_TRACKER.md, with evidence conditions. Green CI does not close these.
- Current remediation priority: D01/D02/D04 recovery safety, then stale writes and malformed backups, financial/statement correctness, performance and UI. New features and production release paused.
- Full audit PDF and raw test evidence are owner-local and not checked into Git. Ask only for the specific missing evidence if needed. Never upload actual financial records.

Read only what the task needs:
- Financial rules: FINANCIAL_BEHAVIOR_CONTRACT.md
- Data formats: DATA_FORMATS_AND_MIGRATIONS.md (audit found stale documentation; verify source)
- Reconciliation: ANDROID_ACCOUNT_BALANCE_RECONCILIATION_PHASE_2_ACCEPTANCE.md and related phase documents
- Distribution: ANDROID_DISTRIBUTION.md
- Findings: AUDIT_TRACKER.md
Historical progress.md, findings.md and old Superpowers plans are historical, not the current acceptance checklist.

Update this file only for material architecture or acceptance changes; update the audit tracker when a finding is verified closed or formally reclassified.
