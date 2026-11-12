#!/usr/bin/env bash
set -euo pipefail

work="$RUNNER_TEMP/ekstre-upgrade"
mkdir -p "$work"
gradle -p android_app assembleRelease lintRelease assembleBeta --no-daemon

previous=$(sed -n 's/^previousSourceCommit=//p' android_app/distribution.properties)
if [[ -n $previous ]]; then
  [[ $previous =~ ^[a-f0-9]{40}$ && $previous != "$(git rev-parse HEAD)" ]]
  git merge-base --is-ancestor "$previous" HEAD
  git worktree add --detach "$work/previous-source" "$previous"
  gradle -p "$work/previous-source/android_app" assembleUpgradeTest --no-daemon
  baseline=("$work"/previous-source/android_app/app/build/outputs/apk/upgradeTest/*.apk)
else
  gradle -p android_app assembleUpgradeTest -PbootstrapUpgrade --no-daemon
  baseline=(android_app/app/build/outputs/apk/upgradeTest/*.apk)
fi
test "${#baseline[@]}" = 1
cp "${baseline[0]}" "$work/baseline.apk"

gradle -p android_app assembleUpgradeTest assembleUpgradeTestAndroidTest -PupgradeDeviceTest --no-daemon
candidate=(android_app/app/build/outputs/apk/upgradeTest/*.apk)
instrumentation=(android_app/app/build/outputs/apk/androidTest/upgradeTest/*.apk)
test "${#candidate[@]}" = 1
test "${#instrumentation[@]}" = 1
cp "${candidate[0]}" "$work/candidate.apk"
cp "${instrumentation[0]}" "$work/instrumentation.apk"

bash android_app/tests/test-distribution-signing.sh \
  android_app/app/build/outputs/apk/release/app-release-unsigned.apk \
  "$work/candidate.apk" android_app/app/build/outputs/apk/beta/app-beta-unsigned.apk
