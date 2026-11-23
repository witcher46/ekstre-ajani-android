# AGENTS.md — Ekstre Ajanı Android

## Scope and safety
- This repository is Android only, including its bundled WebView HTML/CSS/JS. Never modify desktop or web repositories.
- Start with the requested task ID, existing branch/HEAD and dirty status. Preserve user changes. Resume existing work; do not create duplicate branches or reset, clean, or force-push.
- Read only the relevant sections of docs/PROJECT_STATE.md, docs/AUDIT_TRACKER.md and the referenced source/tests. Do not re-audit the entire repository or re-read complete logs/reports by default.
- Do not merge, release, publish APKs, access real financial data or change signing credentials without explicit owner authorization. Use synthetic fixtures only.

## Usage discipline
- Default to one primary agent. Do not spawn/delegate to subagents or invoke multi-agent review, parallel agent or subagent-driven-development skills without explicit owner approval. If using Superpowers, prefer inline execution and targeted TDD/debugging; skip optional brainstorming and repetitive reviews.
- Inspect the smallest relevant code paths, callers and existing tests. Use indexed search and bounded line ranges; avoid whole-tree dumps, large outputs and repeated reads. Save full logs outside model context; read relevant failures and summaries, retaining complete evidence for critical tests. Never suppress failures or fabricate results.
- Use existing dependencies and tools; Context7 only for uncertain API contracts. No unsolicited new MCP servers, plugins, packages, security scans or installation scripts.
- One scoped change at a time. Start with a short plan, reproduce the bug, apply a minimal fix, run targeted regressions. Expand scope only when evidence requires it; report unrelated findings separately.
- Keep one short checkpoint per meaningful milestone: task ID, branch/HEAD, changed files, tests run/results, blocker and next command. Reuse checkpoints after interruptions. Keep temporary checkpoints out of application commits unless explicitly requested.
- Do not repeat successful tests on unchanged relevant code/environment; rerun affected tests after changes. Use GitHub CI for final candidate verification rather than duplicating the full suite locally. Avoid polling CI continuously; report pending checks honestly.
- If a task is blocked or becomes materially larger, stop after a checkpoint and explain the blocker. No open-ended investigation or unrequested refactor.

## Non-negotiable quality
- Follow docs/FINANCIAL_BEHAVIOR_CONTRACT.md: integer kuruş, opening balances not income, transfers and card repayment not duplicate expenses, source identity and user categories preserved. Audit findings may require a specific documented policy correction; never silently change financial semantics.
- Preserve supported JSON versions, SQLite atomicity/CAS, approval history, source evidence and recovery guarantees. Do not weaken validation, remove regressions, or bypass failing gates to save usage.
- Before claiming a critical defect fixed, reproduce the original scenario and verify the fix using appropriate real Android/SQLite or JS evidence. Browser tests are not native-device evidence.
- Code PRs must pass existing verify/android/upgrade gates on the final candidate as applicable under the repository CI policy; separate physical-device and production-signature acceptance. Docs-only tasks require review of the doc diff, not a redundant local APK build.
- Report concise results: issue IDs, files, tests actually run, HEAD/tree, CI links/status and remaining risks. Open draft PR only if authorized; no merge without separate approval.

## Useful paths
- Android shell/storage: android_app/app/src/main/java/com/zagor/ekstre/
- WebView app/finance/parser: android_app/app/src/main/assets/
- JS tests: android_app/tests/; native tests: android_app/app/src/androidTest/
- CI: .github/workflows/; architecture and contracts: docs/
