#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/android/env.sh
export CARGO_HTTP_MULTIPLEXING="${CARGO_HTTP_MULTIPLEXING:-false}"
node scripts/android/doctor.mjs
pnpm tauri android build --debug --apk --target aarch64
