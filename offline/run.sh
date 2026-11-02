#!/bin/sh
set -eu

offline_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(dirname -- "$offline_dir")
system=$(uname -s)
machine=$(uname -m)

case "$system:$machine" in
  Darwin:arm64) triple=darwin-arm64; archive="node-v24.22.2-darwin-arm64.tar.gz" ;;
  Darwin:x86_64) triple=darwin-x64; archive="node-v24.22.2-darwin-x64.tar.gz" ;;
  Linux:aarch64|Linux:arm64) triple=linux-arm64; archive="node-v24.22.2-linux-arm64.tar.xz" ;;
  Linux:x86_64)
    if [ -e /lib/ld-musl-x86_64.so.1 ] || [ -e /usr/lib/ld-musl-x86_64.so.1 ]; then
      triple=linux-x64-musl
      archive="node-v24.22.2-linux-x64-musl.tar.xz"
    else
      triple=linux-x64
      archive="node-v24.22.2-linux-x64.tar.xz"
    fi
    ;;
  *)
    echo "No bundled Node 24.22.2 runtime for $system/$machine." >&2
    exit 1
    ;;
esac

runtime_root="$offline_dir/.runtime/$triple"
runtime_dir="$runtime_root/node-v24.22.2-$triple"
node="$runtime_dir/bin/node"
if [ ! -x "$node" ]; then
  mkdir -p "$runtime_root"
  tar -xf "$offline_dir/runtimes/$archive" -C "$runtime_root"
fi

PATH="$runtime_dir/bin:$PATH"
export PATH
exec "$node" "$root/scripts/offline.mjs" "$@"
