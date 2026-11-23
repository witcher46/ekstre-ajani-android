# Independent Android audit tracker

Source: Android-Teknik-Denetim.pdf, pages 10–15 (21–22 Nov 2026 audit; report completed 24 Nov).
Baseline main aae505b3c7a01a416bb9059c442f0161e167f00e; tree 06cf6f25b455dee7a2d4d4857ac71cd2cedac6cf.
All entries OPEN at baseline: 1 P0, 5 P1, 11 P2, 7 P3. Severity follows the full report. Evidence is environment-specific; synthetic tests do not establish real-world frequency. Close only with a linked fix and regression result on the tested commit, or documented owner-approved reclassification. This index is not a substitute for the original evidence.

| ID | Priority | Scope / observed defect | Closure criterion | State |
|---|---|---|---|---|
| D01 | P0 | MainActivity/app: corrupt slots 1/2, valid slot 3 inaccessible; external restore overwrites last good recovery | Real SQLite recovery succeeds; last good bytes protected, failed writes atomic | OPEN |
| D02 | P1 | Failed load exports valid-looking empty JSON | Invalid load blocks ordinary export; valid empty wallet still exports | OPEN |
| D04 | P2 | Missing export buffer after Activity recreation can truncate target | Check payload before opening target; existing bytes unchanged | OPEN |
| D03 | P2 | Ordinary stale save overwrites newer budget | Stale write rejected safely; current data unchanged | OPEN |
| D05 | P2 | Demo replaces saved budget/category in otherwise empty wallet | Preserve all pre-existing settings or require explicit safe separate demo | OPEN |
| D06 | P2 | Duplicate subscription/statement IDs accepted in backup | Reject ambiguous identifiers without changing existing wallet | OPEN |
| F-B5 | P2 | Expense with inappropriate target creates phantom cash on restore | Validate kind/target relationships; safe reject or explicit repair | OPEN |
| F-B3 | P1 | USD-only QNB statement verified as TRY | No unsupported/ambiguous currency written as TRY; test explicit TRY equivalents | OPEN |
| F-B2 | P1 | Included post-cut-date row counted again (100 -> 200 TL) | Flag date inconsistency; do not count statement-included identity twice | OPEN |
| F-S1 | P1 | Future manual payment reduces today's balance/debt | Define actual-vs-planned date policy; no premature realized payment | OPEN |
| F-B1 | P2 | Two 40 TL document payments become 40 TL while one bank candidate pending | Document total remains 80; known bank outflow remains 40; explicit ambiguity | OPEN |
| F-B4 | P2 | Unrecognized date rows offset each other and verified status misses them | Recognize or flag suspicious rows; no false completeness claim | OPEN |
| U01 | P1 | 300 CSV rows / 3,000 rules preview median 13.866 s in desktop Chrome | Index rules per import; preserve ambiguity and selection; measure comparable workload | OPEN |
| U04 | P2 | Imported history rescans on every startup | Indexed candidate lookup preserves matching semantics and reduces repeated scan | OPEN |
| U02 | P2 | Card/account history capped at 150 without continuation | All 250 sample rows accessible with list-specific paging | OPEN |
| U03 | P2 | Focused controls obscured by fixed navigation at 200% | Focused controls visible across supported text scales | OPEN |
| U05 | P2 | Show-more loses keyboard focus | Focus first newly revealed row, continue keyboard navigation | OPEN |
| U06 | P3 | No search result shows first-use empty text | Distinguish empty wallet, period and no match | OPEN |
| U07 | P3 | Category suggestion misstates parent merchant vs branch rule | Accurate explanation for rule source | OPEN |
| U08 | P3 | Back label and history destination inconsistent | Label matches destination; back does not create forward history | OPEN |
| U09 | P3 | Income plan route has no focusable h1 | Independent route heading receives focus | OPEN |
| U10 | P3 | Review checkbox label below 48px target | Accessible full-row touch target | OPEN |
| A01 | P3 | Missing structuredClone leaves blank startup | Capability check and actionable update notice | OPEN |
| A02 | P3 | Backup/version docs stale | Accurate supported formats/version docs | OPEN |

## Release gates still open
- Valid reconciliation approval/history and freshness with complete synthetic independent-source inputs.
- Physical TalkBack, IME, low-memory/device lifecycle and supported WebView checks.
- Actual bank template coverage; no real private PDF uploads to Git/CI.
- Genuine production signing/package continuity and safe in-place upgrade on an isolated acceptance device.
- Full applicable CI and independent critical-fix review; no production publication before explicit owner authorization.
