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

# Keep a real v2-capable reader for the v3 compatibility check.
if [[ $previous == f4fc0ec18e63309f546747e28043f910fb1b377a ]]; then
  previous_v2=b09244d87ab4c850ca5055c85f155d0f67c54807
  git merge-base --is-ancestor "$previous_v2" HEAD
  git worktree add --detach "$work/previous-v2-source" "$previous_v2"
  gradle -p "$work/previous-v2-source/android_app" assembleUpgradeTest --no-daemon
  prior_v2=("$work"/previous-v2-source/android_app/app/build/outputs/apk/upgradeTest/*.apk)
  test "${#prior_v2[@]}" = 1
  cp "${prior_v2[0]}" "$work/previous-v2.apk"
fi
bash android_app/tests/test-distribution-signing.sh \
  android_app/app/build/outputs/apk/release/app-release-unsigned.apk \
  "$work/candidate.apk" android_app/app/build/outputs/apk/beta/app-beta-unsigned.apk
