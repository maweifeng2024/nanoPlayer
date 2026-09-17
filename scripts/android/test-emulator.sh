#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/android/env.sh
if [[ "${1:-}" == "--" ]]; then shift; fi
serial="${1:-emulator-5554}"
if [[ ! "$serial" =~ ^emulator-[0-9]+$ ]]; then
  echo "Specify an emulator serial; this fixture runner does not target personal devices." >&2
  exit 1
fi
adb -s "$serial" get-state >/dev/null
pnpm android:build:debug
src-tauri/gen/android/gradlew -p src-tauri/gen/android \
  :tauri-plugin-nanoplayer-mobile:testDebugUnitTest :app:assembleUniversalDebugAndroidTest \
  -x :app:rustBuildUniversalDebug -PabiList=arm64-v8a -ParchList=arm64 -PtargetList=aarch64
adb -s "$serial" install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
adb -s "$serial" install -r src-tauri/gen/android/app/build/outputs/apk/androidTest/universal/debug/app-universal-debug-androidTest.apk
mkdir -p artifacts/android/tests
report="artifacts/android/tests/${serial}-instrumentation.txt"
adb -s "$serial" shell am instrument -w -r app.nanoplayer.android.test/androidx.test.runner.AndroidJUnitRunner | tee "$report"
# adb can exit zero even when the instrumentation assertions fail.
if ! rg -q '^OK \([0-9]+ tests?\)' "$report"; then
  echo "Native assertions did not pass: $report" >&2
  exit 1
fi
