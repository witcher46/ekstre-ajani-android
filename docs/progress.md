# SDD ledger — plan: docs/superpowers/plans/2026-11-08-android-ux-finance.md

Baseline: remote da51ba562c25be316edcb94fbf56ea3ad2f9cb92; all 19 local blob hashes match. Local isolated branch android/ux-finance-revision, root baseline bbff909. Existing 14 core tests passed.

Ruling: user's detailed action request authorizes the implementation approach and inline execution; do not add planning approval gates. GitHub upload remains a separate user-required gate. Cost if wrong: design adjustments may be requested, but no remote or user-data side effects occur.

Ruling: original android_app is an export without local Git history. Create an isolated Git checkout from exact remote-verified bytes rather than attempting a worktree of unrelated desktop/mobile repositories. Cost if wrong: local baseline has synthetic history; remote commit must use the real remote parent.

Pre-flight: Task 3 consumes Task 2 summary/cardStatus/importCsv/resolveCandidate/paySubscription signatures; existing function names preserved and optional parameters added. Task 4 keeps version=1 and package ID, so old records remain readable.

Task 1: in progress. Native baseline cannot be newly executed until remote diagnostic tests are approved for upload; no Android-only claim will be made from Chrome evidence.

Task 1: complete — baseline UI journey created bank/cash/two cards and seven actual form-entered records; persisted reload verified. 56 layout scenarios, 38 failed; screenshots saved. 15 revision tests: 13 RED, 2 already passing. Findings in docs/findings.md.

Task 2: initial RED→GREEN complete — existing 14 + new 15 = 29/29 passed. Source import candidates remain pending until explicit linking/distinct choice. Calendar summary defaults to transaction date; latest statement anchors card estimate; subscription actual date and billing day preserved. Remaining cross-component validation will be tested during UI and final review.

Task 3: complete locally — existing 9 UI checks, corrected 56-case audit, and 13 extended UI checks passed. Browser download is blocked by this environment; test verifies real export Blob payload and file-input restore/recovery, not a successful browser file save. Corrected baseline was rerun: 26/56 failed vs 0/56 revised.

Task 4: native source and tests prepared; NOT complete/verified until CI approval. Added font-scale/keyboard/picker/PDF/native storage journeys, before-APK screenshot, large snapshot/recovery coverage. Java/Gradle not compiled locally.

Ruling: old debug signing key is unavailable. Use side-by-side .revision debug package to preserve old APK/data; keep JSON v1 compatible. Cost: user must export/import JSON and two apps do not auto-sync. In-place update is not promised.

Final review: independent fresh-context reviewer reviewed bbff909..5cbe161, no changes made by reviewer. Five Important findings: statement association after matching; explicit distinct decision on edits; three-source payment groups; replaced source/financial edit links; backup size/byte mismatch. Each has RED→GREEN coverage; suite now 40/40. Paid-statement reminder display was regraded to necessary P1 and fixed with a regression test because the user explicitly asked for correct payment status.

Final: fixed statement-period provenance, note-edit distinct decisions, three-source groups, replaced-source review and financial-edit guard, and backup roundtrip — 7 new tests RED→GREEN, suite 40/40. Old 8M-char save limit could exceed 8MB restore/export; new common 32MB UTF-8 limit preserves old allowed content and compact JSON avoids pretty-print inflation.

Final: Ruling: native compile/emulator/picker/export/crash recovery remains unverified until approved CI; do not claim device readiness from browser checks. Cost if wrong: native failures may require another fix/build iteration.
Final: Ruling: real bank PDF layout coverage requires synthetic native fixtures now and real-phone acceptance later; never upload real statements. Cost: unsupported bank layouts may need additional parser fixtures.
Final: Ruling: old-package data retention is achieved by side-by-side package, not an in-place migration. CI before-APK test only opens/captures old package; it does not claim to migrate populated old storage. Cost: manual JSON transfer remains necessary.
Final: minor (deferred): permanent production signing/distribution; requires separate key ownership and release decision. No private keys added.

Task 5: local review and tests complete. Remote upload/new APK pending user approval; no revised source has been sent to GitHub.

Final verification update: 43/43 finance and compatibility tests. Added explicit installment distinction/metadata and conflicting PDF-period tests. Existing 9 UI checks, 56 layout cases, 13 extended UI checks green. Native test compilation/execution still pending.
