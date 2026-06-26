#!/usr/bin/env bash
# Assina o IPTVPlayer.wgt (gerado por `npm run package:wgt`) com o Tizen CLI.
# Saida: IPTVPlayer-signed.wgt (esse e' o arquivo que sobe na Samsung USB Demo
# Packaging Tool). Requer Tizen Studio CLI + um security profile (default: iptv).
#
# Override por env:
#   TIZEN_HOME    (default ~/tizen-studio)
#   JAVA_HOME     (default JDK 17 — Java 25 quebra o tooling Tizen)
#   TIZEN_PROFILE (default iptv)
set -euo pipefail

TZ_HOME="${TIZEN_HOME:-$HOME/tizen-studio}"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
export PATH="$TZ_HOME/tools/ide/bin:$TZ_HOME/tools:$JAVA_HOME/bin:$PATH"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WGT="$ROOT/IPTVPlayer.wgt"
PROFILE="${TIZEN_PROFILE:-iptv}"

[ -f "$WGT" ] || { echo "✗ $WGT ausente — rode 'npm run package:wgt' antes."; exit 1; }
command -v tizen >/dev/null || { echo "✗ tizen CLI nao encontrado em $TZ_HOME"; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

unzip -q "$WGT" -d "$STAGE"
tizen package -t wgt -s "$PROFILE" -- "$STAGE" >/dev/null

OUT="$(ls "$STAGE"/*.wgt | head -1)"
cp "$OUT" "$ROOT/IPTVPlayer-signed.wgt"
echo "✓ $ROOT/IPTVPlayer-signed.wgt"
echo "  Suba esse arquivo na Samsung USB Demo Packaging Tool (Seller Office)."
