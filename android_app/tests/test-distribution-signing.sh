#!/usr/bin/env bash
set -euo pipefail
umask 077

apk=$1
work=$(mktemp -d "${RUNNER_TEMP:-/tmp}/ekstre-sign-test.XXXXXX")
trap 'rm -f -- "$work/test.p12" "$work/error"' EXIT
export ANDROID_KEYSTORE_PASSWORD
ANDROID_KEYSTORE_PASSWORD=$(openssl rand -hex 24)
keytool -genkeypair -storetype PKCS12 -keystore "$work/test.p12" \
  -alias ekstre-android -keyalg RSA -keysize 2048 -validity 2 \
  -dname 'CN=Ekstre Ajanı CI disposable test' -storepass:env ANDROID_KEYSTORE_PASSWORD \
  >/dev/null 2>&1
export ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_BASE64=$(base64 -w 0 "$work/test.p12")
export ANDROID_DISTRIBUTION_CERT_SHA256
ANDROID_DISTRIBUTION_CERT_SHA256=$(keytool -exportcert -storetype PKCS12 \
  -keystore "$work/test.p12" -alias ekstre-android -storepass:env ANDROID_KEYSTORE_PASSWORD \
  | sha256sum | cut -d' ' -f1)
export ANDROID_LAST_DISTRIBUTED_VERSION_CODE=0
source_commit=$(git rev-parse HEAD)
sign=android_app/ci/sign-distribution.sh

expect_failure() {
  local expected=$1
  shift
  if "$@" >"$work/error" 2>&1; then
    echo "Signing unexpectedly accepted an invalid request." >&2
    exit 1
  fi
  grep -F "$expected" "$work/error"
  test ! -e "$work/rejected"
}

expect_failure 'Signing credentials are missing.' \
  env -u ANDROID_KEYSTORE_BASE64 bash "$sign" "$apk" "$work/rejected" "$source_commit"
expect_failure 'versionCode must exceed the last distributed code.' \
  env ANDROID_LAST_DISTRIBUTED_VERSION_CODE=2100000000 bash "$sign" "$apk" "$work/rejected" "$source_commit"
if grep -Fxq 'previousSourceCommit=' android_app/distribution.properties; then
  expect_failure 'Previous distribution source commit is required.' \
    env ANDROID_LAST_DISTRIBUTED_VERSION_CODE=1 bash "$sign" "$apk" "$work/rejected" "$source_commit"
fi
expect_failure 'APK certificate does not match the pinned certificate.' \
  env ANDROID_DISTRIBUTION_CERT_SHA256="$(printf '%064d' 0)" bash "$sign" "$apk" "$work/rejected" "$source_commit"

expect_failure 'Debuggable APKs cannot be distributed.' \
  bash "$sign" "$2" "$work/rejected" "$source_commit"
expect_failure 'APK package or version does not match the distribution configuration.' \
  bash "$sign" "$3" "$work/rejected" "$source_commit"

bash "$sign" "$apk" "$work/signed" "$source_commit"
(
  cd "$work/signed"
  sha256sum -c SHA256SUMS.txt
  diff -u <(printf '%s\n' APK-INFO.txt APK-SIGNATURE.txt SHA256SUMS.txt SOURCE-COMMIT.txt ekstre-ajani-android.apk) \
    <(find . -maxdepth 1 -type f -printf '%f\n' | LC_ALL=C sort)
)
expect_failure 'Expected an unsigned APK.' \
  bash "$sign" "$work/signed/ekstre-ajani-android.apk" "$work/rejected" "$source_commit"
echo "Disposable distribution signing and rejection checks passed."
