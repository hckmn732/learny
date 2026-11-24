#!/usr/bin/env bash
# Arrête l'émulateur Android local de la VM de développement (ADR-3018).
#
# Idempotent : ne fait rien si aucun émulateur ne tourne. `adb emu kill` ferme proprement l'AVD ;
# à défaut (adb muet), le processus lancé par `emulator-up.sh` est arrêté par son PID, puis les
# verrous périmés de l'AVD sont supprimés pour que le prochain démarrage soit un vrai démarrage à
# froid.
#
# Usage : bash tools/dev/emulator-down.sh
set -euo pipefail

SDK="${ANDROID_SDK_ROOT:-/opt/android-sdk}"
ADB="$SDK/platform-tools/adb"
AVD="${MOBILE_AVD:-learny}"
LOG_DIR="/root/logs"

say() { printf '%s\n' "• $*"; }

DEVICE="$("$ADB" devices 2>/dev/null | awk 'NR > 1 && $2 == "device" { print $1; exit }')"
if [ -n "$DEVICE" ]; then
  if "$ADB" -s "$DEVICE" emu kill >/dev/null 2>&1; then
    say "arrêt demandé à $DEVICE"
  fi
  for _ in $(seq 1 30); do
    "$ADB" devices 2>/dev/null | awk 'NR > 1 && $2 == "device"' | grep -q . || break
    sleep 1
  done
fi

if [ -f "$LOG_DIR/emulator.pid" ]; then
  PID="$(cat "$LOG_DIR/emulator.pid")"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    say "processus émulateur $PID arrêté"
  fi
  rm -f "$LOG_DIR/emulator.pid"
fi

if pgrep -f "qemu-system-x86_64.*${AVD}" >/dev/null 2>&1; then
  pkill -f "qemu-system-x86_64.*${AVD}" 2>/dev/null || true
  say "qemu restant arrêté"
fi

find "$HOME/.android/avd/${AVD}.avd" -maxdepth 1 -name '*.lock' -exec rm -rf {} + 2>/dev/null || true
say "émulateur $AVD arrêté"
