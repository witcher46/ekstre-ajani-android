# Migration provenance — Android

- Source private repository: `witcher46/ekstre-ajani`; primary local source is the separate `android_revision` Git repository.
- New `main` starts at local `feature/mobile-wallet-finance-v2` head `4c2cfa2783c50934a855c0c0ec0d669eaec44112` (version 0.2.0-deneme). The source branch is also kept by name.
- Local `android/ux-finance-revision` head `fc4215e647903e82bc3dd4b72e647daf0db6cd04` and its ancestry remain on a separate branch.
- GitHub source histories were path-filtered to the Android app and retained as `archive/original/*`: PR #1 source `da51ba562c25be316edcb94fbf56ea3ad2f9cb92` → `7c77cdccf506f8f9fa1e41562c3aa48d5aa3b2d2`; PR #3 source `fa723276472f484edd6e41e9f343cadb5fb9ddcd` → `c8a3e4706b1fb6488fb7aea64668bb386940de13`; PR #4 source `53da4d86c3198669e1c4690f1ac17bc05ff268dd` → `8af13a0b9daf751fa8809a9f2b022210d0763691`. Rewritten IDs reflect Android-only history; original PRs and refs remain unchanged in the source repository.
- The older local Streamlit/PWA history is retained separately as `archive/legacy-streamlit-mobile-pwa` (head `d00ca11da4d4660edab88618a56aafa0f3cec483`). One unreachable local Android commit (`d4863fe45835254f97cc3e12714c250336c4c199`) is kept on `archive/local-unreachable-android-v2`.
- No APK, install artifact, user wallet, backup, signing key, database, statement or credential was included. CI builds only on hosted runners and does not download artifacts from the old private repository.
- The original repository, PRs #1/#3/#4, existing APK and installed app were not changed.