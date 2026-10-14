#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# Xcode does not inherit an interactive shell's Node/Rust tool paths.
export PATH="$PWD/node_modules/.bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.cargo/bin:$PATH"
export IPHONEOS_DEPLOYMENT_TARGET=16.0
export CARGO_HTTP_MULTIPLEXING="${CARGO_HTTP_MULTIPLEXING:-false}"
export CARGO_HTTP_TIMEOUT="${CARGO_HTTP_TIMEOUT:-30}"

# Only simulator tests may reuse the library produced by their preceding build.
if [[ "${NANOPLAYER_IOS_PREBUILT:-NO}" == "YES" ]]; then exit 0; fi

# Preserve existing Git config entries; scope HTTP/1.1 to this build process.
ios_git_config_count="${GIT_CONFIG_COUNT:-0}"
if [[ ! "$ios_git_config_count" =~ ^[0-9]+$ ]]; then
  echo "Invalid GIT_CONFIG_COUNT" >&2
  exit 1
fi
export "GIT_CONFIG_KEY_${ios_git_config_count}=http.version"
export "GIT_CONFIG_VALUE_${ios_git_config_count}=HTTP/1.1"
export GIT_CONFIG_COUNT="$((ios_git_config_count + 1))"
exec pnpm tauri ios xcode-script "$@"
