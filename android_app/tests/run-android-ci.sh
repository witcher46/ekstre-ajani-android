#!/usr/bin/env bash
set -euo pipefail

if [[ "$BUILD_TRIAL_APK" != true ]]; then
  exec gradle connectedDebugAndroidTest --no-daemon
fi

previous_package=com.zagor.ekstre.preview.wallet
trial_package=com.zagor.ekstre.preview.wallet.trial
activity=com.zagor.ekstre.MainActivity
previous_apk="$RUNNER_TEMP/previous-wallet/android_app/app/build/outputs/apk/debug/app-debug.apk"
trial_apk="$RUNNER_TEMP/trial-apk/ekstre-ajani-cuzdan-0.2.1-deneme.apk"
wallet_dir="$RUNNER_TEMP/isolated-wallet-test"
mkdir -p "$wallet_dir"

# Seed only the disposable emulator with the synthetic 0.2.0 snapshot.
python3 - "$wallet_dir/seed.db" <<'PY'
from pathlib import Path
import sqlite3
import sys

wallet = Path("tests/fixtures/android-0.2.0.json").read_text(encoding="utf-8")
with sqlite3.connect(sys.argv[1]) as db:
    db.execute("CREATE TABLE snapshots (id INTEGER PRIMARY KEY, content TEXT NOT NULL)")
    db.execute("INSERT INTO snapshots VALUES (1, ?)", (wallet,))
PY

adb install "$previous_apk"
adb shell am start -W -n "$previous_package/$activity" | grep -F 'Status: ok'
adb shell am force-stop "$previous_package"
adb shell -T "run-as $previous_package sh -c 'cat > databases/wallet.db'" < "$wallet_dir/seed.db"
adb exec-out run-as "$previous_package" cat databases/wallet.db > "$wallet_dir/before.db"
cmp "$wallet_dir/seed.db" "$wallet_dir/before.db"

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

gradle connectedTrialAndroidTest -PtrialDeviceTest --no-daemon
adb exec-out run-as "$previous_package" cat databases/wallet.db > "$wallet_dir/after.db"
cmp "$wallet_dir/before.db" "$wallet_dir/after.db"
echo "Both APKs installed separately. The trial started empty and the 0.2.0 synthetic wallet remained byte-for-byte intact."
