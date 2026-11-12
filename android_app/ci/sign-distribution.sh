#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

fail() { printf '%s\n' "$1" >&2; exit 1; }

[[ $# == 3 ]] || fail 'Expected unsigned APK, output directory and source commit.'
apk=$1
output=$2
commit=$3
[[ $commit =~ ^[a-f0-9]{40}$ ]] || fail 'Invalid source commit.'
[[ $(git rev-parse HEAD) == "$commit" ]] || fail 'Source commit differs from the checked-out source.'
[[ -f $apk && ! -e $output ]] || fail 'APK input or output path is invalid.'
[[ -n ${ANDROID_KEYSTORE_BASE64:-} && -n ${ANDROID_KEYSTORE_PASSWORD:-} ]] || fail 'Signing credentials are missing.'
fingerprint=${ANDROID_DISTRIBUTION_CERT_SHA256:-}
fingerprint=${fingerprint,,}
[[ $fingerprint =~ ^[a-f0-9]{64}$ ]] || fail 'Invalid pinned certificate SHA-256.'
last_code=${ANDROID_LAST_DISTRIBUTED_VERSION_CODE:-}
[[ $last_code =~ ^(0|[1-9][0-9]{0,9})$ ]] && (( last_code <= 2100000000 )) || fail 'Invalid last distributed versionCode.'

sdk="${ANDROID_HOME:?ANDROID_HOME is required}/build-tools/35.0.0"
properties="$(dirname -- "$0")/../distribution.properties"
code=$(sed -n 's/^versionCode=//p' "$properties")
name=$(sed -n 's/^versionName=//p' "$properties")
[[ $code =~ ^[1-9][0-9]{0,9}$ ]] && (( code <= 2100000000 )) || fail 'Invalid configured versionCode.'
(( code > last_code )) || fail 'versionCode must exceed the last distributed code.'
if (( last_code > 0 )); then
  previous=$(sed -n 's/^previousSourceCommit=//p' "$properties")
  [[ $previous =~ ^[a-f0-9]{40}$ && $previous != "$commit" ]] || fail 'Previous distribution source commit is required.'
  git merge-base --is-ancestor "$previous" "$commit" || fail 'Previous distribution source is not an ancestor.'
  previous_code=$(git show "$previous:android_app/distribution.properties" | sed -n 's/^versionCode=//p')
  [[ $previous_code == "$last_code" ]] || fail 'Previous distribution source versionCode does not match the protected value.'
fi
[[ $name =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'Invalid configured versionName.'

apk_info=$("$sdk/aapt" dump badging "$apk")
[[ $apk_info == *"package: name='com.zagor.ekstre' versionCode='$code' versionName='$name'"* ]] \
  || fail 'APK package or version does not match the distribution configuration.'
[[ $apk_info != *application-debuggable* ]] || fail 'Debuggable APKs cannot be distributed.'
if "$sdk/apksigner" verify "$apk" >/dev/null 2>&1; then
  fail 'Expected an unsigned APK.'
fi

private=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/ekstre-signing.XXXXXX")
trap 'rm -f -- "$private/keystore.p12" "$private/signed.apk"; rmdir -- "$private"' EXIT
printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$private/keystore.p12"
unset ANDROID_KEYSTORE_BASE64

"$sdk/apksigner" sign --ks "$private/keystore.p12" --ks-type PKCS12 --ks-key-alias ekstre-android \
  --ks-pass env:ANDROID_KEYSTORE_PASSWORD --key-pass env:ANDROID_KEYSTORE_PASSWORD \
  --v4-signing-enabled false --out "$private/signed.apk" "$apk"
unset ANDROID_KEYSTORE_PASSWORD
rm -f -- "$private/keystore.p12"
signature=$("$sdk/apksigner" verify --verbose --print-certs "$private/signed.apk")
actual=$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' <<<"$signature")
signer_count=$(sed -n 's/^Number of signers: //p' <<<"$signature")
[[ $actual == "$fingerprint" && $signer_count == 1 ]] || fail 'APK certificate does not match the pinned certificate.'

mkdir -- "$output"
mv -- "$private/signed.apk" "$output/ekstre-ajani-android.apk"
printf '%s\n' "$signature" > "$output/APK-SIGNATURE.txt"
"$sdk/aapt" dump badging "$output/ekstre-ajani-android.apk" > "$output/APK-INFO.txt"
printf '%s\n' "$commit" > "$output/SOURCE-COMMIT.txt"
(cd "$output" && sha256sum ekstre-ajani-android.apk > SHA256SUMS.txt)
