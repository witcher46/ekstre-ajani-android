#!/usr/bin/env bash
set -euo pipefail

if [[ "$BUILD_TRIAL_APK" != true ]]; then
  exec gradle connectedDebugAndroidTest --no-daemon
fi

previous_package=com.zagor.ekstre.preview.wallet.trial.v3
trial_package=com.zagor.ekstre.preview.wallet.trial.v31
activity=com.zagor.ekstre.MainActivity
previous_apk="$RUNNER_TEMP/previous-wallet/ekstre-ajani-cuzdan-0.3.0-deneme.apk"
trial_apk="$RUNNER_TEMP/trial-apk/ekstre-ajani-cuzdan-0.3.1-deneme.apk"
wallet_dir="$RUNNER_TEMP/isolated-wallet-test"
mkdir -p "$wallet_dir"

# Seed only the disposable emulator with the synthetic 0.2.0 snapshot.
python3 - "$wallet_dir/seed.db" <<'PY'
from pathlib import Path
import json
import sqlite3
import sys

wallet = json.loads(Path("tests/fixtures/android-0.2.0.json").read_text(encoding="utf-8"))
wallet["merchantCategoryRules"] = [
    {"id": "synthetic-rule", "merchant": "SENTETIK BIMEKS", "category": "Sentetik özel kategori"}
]
wallet["statements"][0].update(reconciliationStatus="verified", importedMovementCount=2)
with sqlite3.connect(sys.argv[1]) as db:
    db.execute("CREATE TABLE snapshots (id INTEGER PRIMARY KEY, content TEXT NOT NULL)")
    db.execute("INSERT INTO snapshots VALUES (1, ?)", (json.dumps(wallet, ensure_ascii=False),))
PY

adb install "$previous_apk"
adb shell am start -W -n "$previous_package/$activity" | grep -F 'Status: ok'
adb shell am force-stop "$previous_package"
adb shell -T "run-as $previous_package sh -c 'cat > databases/wallet.db'" < "$wallet_dir/seed.db"
adb exec-out run-as "$previous_package" cat databases/wallet.db > "$wallet_dir/before.db"
cmp "$wallet_dir/seed.db" "$wallet_dir/before.db"
python3 - "$wallet_dir/before.db" "$wallet_dir/backup.json" <<'PY'
from pathlib import Path
import sqlite3
import sys

with sqlite3.connect(Path(sys.argv[1]).as_uri() + "?mode=ro", uri=True) as db:
    content = db.execute("SELECT content FROM snapshots WHERE id = 1").fetchone()[0]
Path(sys.argv[2]).write_text(content, encoding="utf-8")
PY
backup_path=/data/local/tmp/ekstre-0.3.0-synthetic-backup.json
adb push "$wallet_dir/backup.json" "$backup_path"

adb install "$trial_apk"
adb shell am start -W -n "$trial_package/$activity" | grep -F 'Status: ok'
adb shell am force-stop "$trial_package"
test "$(adb shell run-as "$previous_package" id -u)" != "$(adb shell run-as "$trial_package" id -u)"
adb exec-out run-as "$trial_package" cat databases/wallet.db > "$wallet_dir/trial.db"

python3 - "$wallet_dir/trial.db" <<'PY'
from pathlib import Path
import sqlite3
import sys

with sqlite3.connect(Path(sys.argv[1]).as_uri() + "?mode=ro", uri=True) as db:
    assert db.execute("SELECT COUNT(*) FROM snapshots").fetchone() == (0,)
PY

gradle connectedTrialAndroidTest -PtrialDeviceTest --no-daemon \
  '-Pandroid.testInstrumentationRunnerArguments.class=com.zagor.ekstre.WalletJourneyTest#backupFileRoundTripRetainsRecovery,com.zagor.ekstre.WalletJourneyTest#restorePreviousTrialBackup' \
  "-Pandroid.testInstrumentationRunnerArguments.previousTrialBackup=$backup_path"
adb exec-out run-as "$previous_package" cat databases/wallet.db > "$wallet_dir/after.db"
cmp "$wallet_dir/before.db" "$wallet_dir/after.db"
echo "Both APKs installed separately. The trial started empty and the 0.3.0 synthetic wallet remained byte-for-byte intact."
