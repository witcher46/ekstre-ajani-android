# Independent Android audit tracker

Source: Android-Teknik-Denetim.pdf, pages 10–15 (21–22 Nov 2026 audit; report completed 24 Nov).
Baseline main aae505b3c7a01a416bb9059c442f0161e167f00e; tree 06cf6f25b455dee7a2d4d4857ac71cd2cedac6cf.
All entries OPEN at baseline: 1 P0, 5 P1, 11 P2, 7 P3. Severity follows the full report. Evidence is environment-specific; synthetic tests do not establish real-world frequency. Close only with a linked fix and regression result on the tested commit, or documented owner-approved reclassification. This index is not a substitute for the original evidence.

| ID | Priority | Scope / observed defect | Closure criterion | State |
|---|---|---|---|---|
| D01 | P0 | MainActivity/app: corrupt slots 1/2, valid slot 3 inaccessible; external restore overwrites last good recovery | Real SQLite recovery succeeds; last good bytes protected, failed writes atomic | CLOSED (Phase 1A) |
| D02 | P1 | Failed load exports valid-looking empty JSON | Invalid load blocks ordinary export; valid empty wallet still exports | CLOSED (Phase 1A) |
| D04 | P2 | Missing export buffer after Activity recreation can truncate target | Check payload before opening target; existing bytes unchanged | CLOSED (Phase 1A) |
| D03 | P2 | Ordinary stale save overwrites newer budget | Stale write rejected safely; current data unchanged | CLOSED (Phase 1B) |
| D05 | P2 | Demo replaces saved budget/category in otherwise empty wallet | Preserve all pre-existing settings or require explicit safe separate demo | CLOSED (Phase 1B) |
| D06 | P2 | Duplicate subscription/statement IDs accepted in backup | Reject ambiguous identifiers without changing existing wallet | CLOSED (Phase 1B) |
| F-B5 | P2 | Expense with inappropriate target creates phantom cash on restore | Validate kind/target relationships; safe reject or explicit repair | CLOSED (Phase 1B) |
| F-B3 | P1 | USD-only QNB statement verified as TRY | No unsupported/ambiguous currency written as TRY; test explicit TRY equivalents | CLOSED (code/CI) |
| F-B2 | P1 | Included post-cut-date row counted again (100 -> 200 TL) | Flag date inconsistency; do not count statement-included identity twice | CLOSED (code/CI) |
| F-S1 | P1 | Future manual payment reduces today's balance/debt | Define actual-vs-planned date policy; no premature realized payment | CLOSED (code/CI) |
| F-B1 | P2 | Two 40 TL document payments become 40 TL while one bank candidate pending | Document total remains 80; known bank outflow remains 40; explicit ambiguity | CLOSED (code/CI) |
| F-B4 | P2 | Unrecognized date rows offset each other and verified status misses them | Recognize or flag suspicious rows; no false completeness claim | CLOSED (code/CI) |
| U01 | P1 | 300 CSV rows / 3,000 rules preview median 13.866 s in desktop Chrome | Index rules per import; preserve ambiguity and selection; measure comparable workload | CLOSED (code/CI) |
| U04 | P2 | Imported history rescans on every startup | Indexed candidate lookup preserves matching semantics and reduces repeated scan | CLOSED (code/CI) |
| U02 | P2 | Card/account history capped at 150 without continuation | All 250 sample rows accessible with list-specific paging | CLOSED (code/CI) |
| U03 | P2 | Focused controls obscured by fixed navigation at 200% | Focused controls visible across supported text scales | CLOSED (code/CI) |
| U05 | P2 | Show-more loses keyboard focus | Focus first newly revealed row, continue keyboard navigation | CLOSED (code/CI) |
| U06 | P3 | No search result shows first-use empty text | Distinguish empty wallet, period and no match | CLOSED (code/CI) |
| U07 | P3 | Category suggestion misstates parent merchant vs branch rule | Accurate explanation for rule source | CLOSED (code/CI) |
| U08 | P3 | Back label and history destination inconsistent | Label matches destination; back does not create forward history | CLOSED (code/CI) |
| U09 | P3 | Income plan route has no focusable h1 | Independent route heading receives focus | CLOSED (code/CI) |
| U10 | P3 | Review checkbox label below 48px target | Accessible full-row touch target | CLOSED (code/CI) |
| A01 | P3 | Missing structuredClone leaves blank startup | Capability check and actionable update notice | CLOSED (code/CI) |
| A02 | P3 | Backup/version docs stale | Accurate supported formats/version docs | CLOSED (code/CI) |

## Phase 1A acceptance

[PR #27](https://github.com/witcher46/ekstre-ajani-android/pull/27) merged at `dc96a02a1a18c547f7508ff6ba507801acbc674d`. Candidate `2da9d0295117725f20525e51c06557c2d28dffa7` passed `verify`, `android` and `upgrade`. [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45511972641/job/138861705865) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45511972641/job/138861706070) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45511972654/job/138861705976)

- **D01** — Android 35 restored the synthetic 74,325-kuruş wallet after Activity recreation, preserved the readable copy from either backup slot and rolled back every slot after an injected write failure. [Android evidence](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45511972641/job/138861706070)
- **D02** — WebView distinguished missing SQLite rows from empty or unreadable records. The browser recovery regression verified that invalid loads blocked export and a valid empty wallet could be exported. [Android evidence](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45511972641/job/138861706070) · [Browser evidence](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45511972641/job/138861705865)
- **D04** — The Android 35 regression delivered a picker result after Activity recreation and verified that the existing destination retained every byte. [Android evidence](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45511972641/job/138861706070)

## Phase 1B acceptance

[PR #28](https://github.com/witcher46/ekstre-ajani-android/pull/28) merged at `5cc79c53022e2db86548d5453c7c18424b6ddd94` with the same tree as tested candidate `3fb31fa0fb672116951be5a5278240e77991ead1`. Owner authorized merge only. [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45519563048/job/138887691706) (263/263 Node tests; legacy optional target and F-B5 regressions passed) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45519563048/job/138887691159) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45519563064/job/138887690527).

- D03: native staleOrdinaryWritePreservesEverySnapshot passed.
- D05: demo is restricted to first-ever unsaved wallet; CI passed on the candidate.
- D06: duplicateBackupIdsPreserveEverySnapshot passed.
- F-B5: invalidBackupTargetPreservesEverySnapshot and Node phantom cash regression passed; inert legacy metadata remains readable.

These are code/CI closures, not physical-device or production release acceptance.

## Phase 2 history and current closure

Phase 2 began with F-B3, covering unsupported or ambiguous statement currency and explicit TRY equivalents. The remaining financial findings followed. As of 26 Nov 2026, all 24 baseline findings are closed at code and CI level. Release acceptance remains open.

## Closure evidence for the 17 remaining baseline findings

Each tested candidate passed the linked Verify, Android and Upgrade jobs.

| ID | PR | Tested candidate | Merge commit | CI jobs |
|---|---|---|---|---|
| F-B3 | [#30](https://github.com/witcher46/ekstre-ajani-android/pull/30) | `dbbc3e61f88982937b0363a6639acbbe09044d8d` | `c1a099d842170b154b3fad08c7f5db553a5b5495` | [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45662669688/job/139376385853) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45662669688/job/139376385170) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45662669853/job/139376385390) |
| F-B2 | [#33](https://github.com/witcher46/ekstre-ajani-android/pull/33) | `3538bd0ee97e2e3313911bb2da492c43ddcd92ec` | `b6c18747365907500ae0679fbcac435d7b7e504e` | [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45698122607/job/139500785841) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45698122607/job/139500786103) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45698122639/job/139500785445) |
| F-S1 | [#34](https://github.com/witcher46/ekstre-ajani-android/pull/34) | `70d701e66d9684db4f688172fbf4dd2eff59d532` | `74b66e33c24e432103926f3d7b554ac6caf21d65` | [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45707266015/job/139532309539) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45707266015/job/139532309840) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45707266185/job/139532309849) |
| F-B1 | [#35](https://github.com/witcher46/ekstre-ajani-android/pull/35) | `edeea2c23e0a53ab1ae8868b0aa1f44b45741893` | `9a6b52aba9337762101883d18c9bfe11b30a8278` | [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45713836637/job/139554753567) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45713836637/job/139554752069) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45713836662/job/139554751287) |
| F-B4 | [#36](https://github.com/witcher46/ekstre-ajani-android/pull/36) | `b9fca27ee66119a4f8f34fc422b18b039e7c1c17` | `4b83ff99c88a44aaaa5c65b1f91f7f2b08c34818` | [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45718106757/job/139569246564) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45718106757/job/139569246974) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45718106766/job/139569246702) |
| U01 | [#37](https://github.com/witcher46/ekstre-ajani-android/pull/37) | `d2ae659e823e7965be27ea77a5786eed85b21440` | `53a4483ac2565eca0527eda65969cab793c5e625` | [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45725437420/job/139594007119) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45725437420/job/139594007511) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45725437430/job/139594007073) |
| U04 | [#38](https://github.com/witcher46/ekstre-ajani-android/pull/38) | `3e7d1bbc71913e6ce9add3e69fa9c81e115292c4` | `3a4a56654736d0271f9d8cfb06bdc3ca15dca494` | [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45730708933/job/139611710184) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45730708933/job/139611710602) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45730708926/job/139611710415) |
| U02 | [#39](https://github.com/witcher46/ekstre-ajani-android/pull/39) | `9aa3ed4966cd1606756ca8722ae9170daf478c7e` | `3b8d034be41df15fe93b85f9202a10530d724213` | [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45733794578/job/139622030515) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45733794578/job/139622030200) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45733794518/job/139622030158) |
| U03 | [#40](https://github.com/witcher46/ekstre-ajani-android/pull/40) | `50f9800315cc285730daf4706367e260f203a053` | `92e2181017e6821586c55c59a451dc659a976858` | [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45739032077/job/139639194805) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45739032077/job/139639194451) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45739032126/job/139639194452) |
| U05 | [#41](https://github.com/witcher46/ekstre-ajani-android/pull/41) | `10f730b6e1452c12aa40479a90bb9a7deb426aaa` | `37746b6603fe529921ef2c101026d9339ad2831c` | [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45743206927/job/139652955674) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45743206927/job/139652955657) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45743207191/job/139652956696) |
| A01 | [#42](https://github.com/witcher46/ekstre-ajani-android/pull/42) | `b398c5c2a4ae599c902405cb6fd0bfaf20ee64ff` | `ed62306205b4155f033d26eca7392ceb62594053` | [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45749240839/job/139672768227) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45749240839/job/139672767308) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45749240853/job/139672766728) |
| A02 | [#43](https://github.com/witcher46/ekstre-ajani-android/pull/43) | `06a1c7b472c31bf2340fea27a4d9eb104d3ce940` | `8bd8e2301339bf3e674c15b6de9b9c87c3904b03` | [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45752822764/job/139684390608) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45752822764/job/139684390845) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45752822943/job/139684390850) |
| U06 | [#44](https://github.com/witcher46/ekstre-ajani-android/pull/44) | `cddd268d104af4d98ff8168fc08d452029363ff4` | `400d749998d611b00d76309dc4e5dac36c34bcfa` | [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45758727184/job/139703422310) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45758727184/job/139703421998) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45758727231/job/139703421793) |
| U07 | [#45](https://github.com/witcher46/ekstre-ajani-android/pull/45) | `b775c9282ac5e90fc5c11ebc646663fb6e1c6597` | `a992ae792b096f316877eb9383b98b0e1ad61317` | [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45760178520/job/139708070869) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45760178520/job/139708070373) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45760178513/job/139708070340) |
| U08 | [#46](https://github.com/witcher46/ekstre-ajani-android/pull/46) | `a0458d19f0d477bb6046135d6ac50bac4971e823` | `b85d759278a88bf037617e60808d99b3f8c3fb62` | [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45762420565/job/139715272622) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45762420565/job/139715272202) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45762420504/job/139715272454) |
| U09 | [#47](https://github.com/witcher46/ekstre-ajani-android/pull/47) | `c9f5260ec946de02aa14111e70dae5bb8beb58e8` | `9f272f9292c1a72369875008fd7bc549526bac18` | [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45763619810/job/139719179236) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45763619810/job/139719179695) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45763619820/job/139719179196) |
| U10 | [#48](https://github.com/witcher46/ekstre-ajani-android/pull/48) | `97b3c025f24e6521f0912d07d266e9b687960a02` | `0421662eaca2e8878da5a949f47bd536ae098973` | [Verify](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45765181177/job/139724294459) · [Android](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45765181177/job/139724294050) · [Upgrade](https://github.com/witcher46/ekstre-ajani-android/actions/runs/45765181122/job/139724293822) |

- U01 and U04 evidence covers indexed rule and history lookup in synthetic workloads. Real-world performance remains unverified.
- U10 verifies the 48 px CSS touch target in Chromium. Physical Android touch and TalkBack checks remain release gates.

## Release gates still open
- Valid reconciliation approval/history and freshness with complete synthetic independent-source inputs.
- Physical TalkBack, IME, low-memory/device lifecycle and supported WebView checks.
- Actual bank template coverage; no real private PDF uploads to Git/CI.
- Genuine production signing/package continuity and safe in-place upgrade on an isolated acceptance device.
- Full applicable CI and independent critical-fix review; no production publication before explicit owner authorization.
