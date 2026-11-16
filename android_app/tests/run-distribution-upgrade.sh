#!/usr/bin/env bash
set -euo pipefail

work="$RUNNER_TEMP/ekstre-upgrade"
sdk="$ANDROID_HOME/build-tools/35.0.0"
permanent=com.zagor.ekstre
legacy=com.zagor.ekstre.preview.wallet.trial.v31
activity=com.zagor.ekstre.MainActivity
legacy_apk="$RUNNER_TEMP/legacy-apk/ekstre-ajani-cuzdan-0.3.1-deneme.apk"
backup_path=/data/local/tmp/ekstre-legacy-synthetic.json

version_code() {
  "$sdk/aapt" dump badging "$1" |
    sed -n "s/^package: name='$permanent' versionCode='\([0-9]\+\)'.*/\1/p"
}
cert() {
  "$sdk/apksigner" verify --print-certs "$1" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p'
}
baseline_code=$(version_code "$work/baseline.apk")
candidate_code=$(version_code "$work/candidate.apk")
expected_code=$(sed -n 's/^versionCode=//p' android_app/distribution.properties)
[[ $baseline_code =~ ^[0-9]+$ && $candidate_code == "$expected_code" ]]
(( candidate_code > baseline_code ))
baseline_cert=$(cert "$work/baseline.apk")
[[ $baseline_cert =~ ^[a-f0-9]{64}$ && $baseline_cert == "$(cert "$work/candidate.apk")" ]]
printf 'Same package and test certificate, versionCode %s -> %s\n' "$baseline_code" "$candidate_code"

python3 - "$work" <<'PY'
from pathlib import Path
import json
import sqlite3
import sys

work = Path(sys.argv[1])
wallet = json.loads(Path("android_app/tests/fixtures/android-0.2.0.json").read_text(encoding="utf-8"))
wallet["merchantCategoryRules"] = [
    {"id": "synthetic-rule", "merchant": "SENTETIK BIMEKS", "category": "Sentetik özel kategori"}
]
wallet["statements"][0].update(reconciliationStatus="verified", importedMovementCount=2)
data = json.dumps(wallet, ensure_ascii=False)
(work / "backup.json").write_text(data, encoding="utf-8")
with sqlite3.connect(work / "legacy-seed.db") as db:
    db.execute("CREATE TABLE snapshots (id INTEGER PRIMARY KEY, content TEXT NOT NULL)")
    db.execute("INSERT INTO snapshots VALUES (1, ?)", (data,))
PY

if [[ -f $legacy_apk ]]; then
  echo "8a4fbd7144bb8452f4d02e0d2363e502f443ca1f209b805baf703581b24bbbeb  $legacy_apk" | sha256sum -c -
  adb install "$legacy_apk"
  adb shell am start -W -n "$legacy/$activity" | grep -F 'Status: ok'
  adb shell am force-stop "$legacy"
  adb shell -T "run-as $legacy sh -c 'cat > databases/wallet.db'" < "$work/legacy-seed.db"
  adb exec-out run-as "$legacy" cat databases/wallet.db > "$work/legacy-before.db"
  cmp "$work/legacy-seed.db" "$work/legacy-before.db"
  python3 - "$work" <<'PY'
from pathlib import Path
import sqlite3
import sys

work = Path(sys.argv[1])
with sqlite3.connect((work / "legacy-before.db").as_uri() + "?mode=ro", uri=True) as db:
    data = db.execute("SELECT content FROM snapshots WHERE id = 1").fetchone()[0]
(work / "backup.json").write_text(data, encoding="utf-8")
PY
else
  echo 'Archived 0.3.1 APK unavailable. Running JSON migration with the equivalent synthetic fixture.'
fi
adb push "$work/backup.json" "$backup_path"

run_case() {
  local method=$1
  shift
  adb shell am instrument -w -r -e class "com.zagor.ekstre.WalletJourneyTest#$method" \
    -e previousTrialBackup "$backup_path" "$@" "$permanent.test/androidx.test.runner.AndroidJUnitRunner" \
    | tr -d '\r' | tee "$work/$method.log"
  grep -Fx 'OK (1 test)' "$work/$method.log"
}

adb install "$work/baseline.apk"
adb install "$work/instrumentation.apk"
run_case restorePreviousTrialBackup
adb shell am force-stop "$permanent"
uid_before=$(adb shell run-as "$permanent" id -u)
adb exec-out run-as "$permanent" cat databases/wallet.db > "$work/before.db"

adb install -r "$work/candidate.apk"
test "$uid_before" = "$(adb shell run-as "$permanent" id -u)"
adb exec-out run-as "$permanent" cat databases/wallet.db > "$work/after.db"
cmp "$work/before.db" "$work/after.db"
# Start instrumentation after force-stop so ActivityScenario opens the app in
# a fresh process. Assert the saved wallet and rendered totals before the byte check.
adb shell am force-stop "$permanent"
run_case upgradedWalletSurvivesRestart -e preserveWallet true
adb shell am force-stop "$permanent"
adb exec-out run-as "$permanent" cat databases/wallet.db > "$work/after-process-restart.db"
cmp "$work/before.db" "$work/after-process-restart.db"
echo 'After a fresh process launch, wallet.db bytes and rendered report totals matched.'

if [[ $baseline_code == 7 && $candidate_code == 8 ]] &&
  grep -Fxq 'previousSourceCommit=f4fc0ec18e63309f546747e28043f910fb1b377a' android_app/distribution.properties; then
  # This compatibility probe uses only the disposable emulator and synthetic wallets.
  # Preserve the original exported file outside the app before opening the old APK.
  observation_path=/data/local/tmp/ekstre-observation-synthetic.json
  node --input-type=module - "$work/backup.json" "$work/observation-seed.json" <<'JS'
import {webcrypto} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {addBalanceObservation,backupText,readBackup} from './android_app/app/src/main/assets/core.mjs';
globalThis.crypto ??= webcrypto;
const [input,output]=process.argv.slice(2);
const wallet=readBackup(readFileSync(input,'utf8'));
const observed=addBalanceObservation(wallet,{
  accountId:'synthetic-bank', observedDate:'2026-11-14',
  observedAmountCents:-9007199254740991, sourceKind:'manualBank', note:'<b>Sentetik</b>',
});
writeFileSync(output,backupText(observed));
JS
  adb push "$work/observation-seed.json" "$observation_path"
  run_case newWalletRestoresOriginalObservationBackup -e preserveWallet true -e observationBackup "$observation_path"
  adb exec-out run-as "$permanent" cat files/synthetic-observation-backup.json > "$work/observation-backup.json"
  adb push "$work/observation-backup.json" "$observation_path"
  adb shell pm clear "$permanent" | tr -d '\r' | grep -Fx Success
  adb install -r -d "$work/baseline.apk"
  run_case oldWalletRejectsObservationBackupAndCanStillSave -e observationBackup "$observation_path"
  adb exec-out cat "$observation_path" > "$work/observation-after-old.json"
  cmp "$work/observation-backup.json" "$work/observation-after-old.json"
  adb install -r "$work/candidate.apk"
  run_case newWalletRestoresOriginalObservationBackup -e preserveWallet true -e observationBackup "$observation_path"
  echo 'Android 0.4.0 rejected the v2 backup before writing. Its v1 save succeeded and the candidate restored every original observation field.'
fi

if [[ -f $legacy_apk ]]; then
  adb exec-out run-as "$legacy" cat databases/wallet.db > "$work/legacy-after.db"
  cmp "$work/legacy-before.db" "$work/legacy-after.db"
  echo 'Archived 0.3.1 wallet remained byte-for-byte intact.'
fi
echo 'JSON restore and in-place update retained the wallet and report totals.'
