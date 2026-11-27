# Ekstre Ajanı Android 0.6 Implementation Plan

> Execute serially, one Codex task at a time. Use targeted test-first verification and independently review each slice; no subagents.

**Goal:** Redesign every app-owned Android screen, form and overlay without changing financial behavior.
**Architecture:** Keep the existing Java Android host and bundled WebView. Add shared styles and reuse the existing route, rendering, dialog and validation machinery. Apply static UI first; add motion only after full static coverage.
**Tech Stack:** Existing HTML/CSS, JavaScript modules, Android Java, repository test harnesses.
**Spec:** Approved 01 Özet, 02 Cüzdan, detailed Raporlar, card/Plan/Ayarlar mockups and bottom navigation B; all downstream surfaces included.

## Global constraints
- Android only. Do not change finance calculations, parser, SQLite or schema, read real financial data, install dependencies, or bypass validation or safety guards.
- Native file picker, keyboard, and OS permissions stay native. Ensure handoffs and app-owned messages are visually consistent.
- No publishing or production signing. Review exact commits, synthetic journeys, and applicable verify/android/upgrade CI before integration. Do not present emulator coverage as physical validation.
- Preserve Turkish text, accessible names, focus/Back behavior, scroll/filter state, large text and 48 dp targets; do not identify states by color alone.

## Slices
1. Shell, Özet and Cüzdan: shared palette, spacing, cards, states; Özet · Cüzdan · Raporlar · Diğer. Keep Özet report, quick-add and statement upload shortcuts. Diğer opens an accessible modal with Plan, İşlemler, Ekstre and Kategoriler; reuse Settings category functionality via shared renderer. Add failing journey for fixed tab and panel choices, dismissal/Back/state/focus and repeat taps. Verify at narrow and normal viewport widths; include synthetic screenshots. Files principally ui/navigation.mjs, app.mjs, views.mjs and existing styles/dialog hook.
2. Reports and category trail: 6/12 month accessible column chart, month/account filters consistently applied to selected month sections and transactions, category ranks and drilldown, gross share distinct from net/refunds. Test synthetic split/refund and scope boundaries. Retain existing comparison, cash flow and missing/zero data states.
3. Transactions and editing: filters/search and empty results; transaction details, quick-add, add/edit including split/installment, transfer, source linkage, and card payment recording. Cover form validation, cancellation, successful save, and duplicate taps.
4. Statements: entry PDF/CSV, previews, card matching, error/retry, import review, source rows/history and detail. Verify existing parsing/safety via synthetic import flows; do not change formats or file permissions.
5. Wallet subpages: card vs bank/cash details, balances, upcoming installments, source evidence, reconciliation, approval result/history/detail. Keep current/period/remaining debt distinct; cover no data and restricted approval paths.
6. Plan subpages: income, goals, budget, recurring charges and reminder/calendar screens, all associated forms, confirmations and permission handoffs. Do not alter scheduling or payment semantics.
7. Settings, categories and recovery: finish category management and merchant rules, export and restore, recovery preview, replace/cancel confirmation and failure/success, demo and version. Check storage/backup behavior with synthetic inputs only; paused filename incident is not part of redesign.
8. Static parity: enumerate every route, dialog, warning and feedback state against the checklist; run accessibility and narrow/large-text checks, fix uncovered surfaces, and verify final applicable CI once. Report physical-device-only acceptance honestly.
9. Separate motion: short touch response and selective transitions, reduced-motion fallback, no interpolated finance figures or premature success feedback. Validate stale UI, Back, focus and fast taps before final integration.

## Review focus
- Closing Diğer from a scrolled/filtered screen leaves it unchanged and restores focus; selecting navigates once and focuses the destination.
- Refund-only and split expense categories remain reachable and selected account/period data never leaks into neighboring scopes.
- Import, backup, reconciliation and destructive confirmation keep all existing decision gates.
- Large amounts, names, text scaling and Android keyboard cannot hide essential controls.
- A report of success means the relevant write actually succeeded; failure and cancellation leave data intact.
