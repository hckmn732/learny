#!/usr/bin/env bash
# Démarre l'émulateur Android local de la VM de développement (ADR-3018).
#
# Idempotent : si un appareil adb est déjà démarré et a fini de booter, ne fait rien ; sinon crée
# l'AVD `learny` (Pixel 6, API 35, 3072 Mo) au besoin, démarre l'émulateur en **démarrage à froid**
# (aucun instantané) et attend `sys.boot_completed`. Affiche ensuite la version d'Android, le
# modèle, la résolution et la RAM de l'appareil.
#
# Variables : MOBILE_AVD (learny), MOBILE_BOOT_TIMEOUT_S (600), ANDROID_SDK_ROOT (/opt/android-sdk).
#
# Usage : bash tools/dev/emulator-up.sh
set -euo pipefail

SDK="${ANDROID_SDK_ROOT:-/opt/android-sdk}"
export ANDROID_SDK_ROOT="$SDK" ANDROID_HOME="$SDK"
ADB="$SDK/platform-tools/adb"
EMU="$SDK/emulator/emulator"
AVDMANAGER="$SDK/cmdline-tools/latest/bin/avdmanager"
AVD="${MOBILE_AVD:-learny}"
TIMEOUT="${MOBILE_BOOT_TIMEOUT_S:-600}"
IMAGE="system-images;android-35;google_apis;x86_64"
LOG_DIR="/root/logs"

say() { printf '%s\n' "• $*"; }
die() { printf '✖ %s\n' "$*" >&2; exit 1; }
now() { date +%s; }

[ -x "$ADB" ] || die "adb absent : $ADB"
[ -x "$EMU" ] || die "émulateur absent : $EMU (sdkmanager --install emulator)"
[ -d "$SDK/system-images/android-35/google_apis/x86_64" ] ||
  die "image système absente : $IMAGE (sdkmanager --install \"$IMAGE\")"

mkdir -p "$LOG_DIR"

# Propriété d'un AVD : une valeur par ligne, mise à jour sans dupliquer la clé.
set_prop() {
  local file="$1" key="$2" value="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

serial() {
  "$ADB" devices | awk 'NR > 1 && ($2 == "device" || $2 == "offline") { print $1; exit }'
}

booted() {
  local s="$1"
  [ "$("$ADB" -s "$s" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n')" = "1" ]
}

wait_for_boot() {
  local s="$1" deadline
  deadline=$(( $(now) + TIMEOUT ))
  while [ "$(now)" -lt "$deadline" ]; do
    if booted "$s"; then
      # Le gestionnaire de paquets doit être prêt avant l'installation de l'APK.
      if "$ADB" -s "$s" shell pm path android >/dev/null 2>&1; then return 0; fi
    fi
    sleep 5
  done
  return 1
}

# 1. AVD : création au besoin, puis mise à jour idempotente du matériel.
AVD_DIR="$HOME/.android/avd/$AVD.avd"
if ! "$EMU" -list-avds 2>/dev/null | grep -qx "$AVD"; then
  say "AVD $AVD absent : création (Pixel 6, API 35, 3072 Mo)"
  mkdir -p "$HOME/.android/avd"
  echo no | "$AVDMANAGER" create avd -n "$AVD" -k "$IMAGE" -d pixel_6 --force >/dev/null 2>&1 ||
    echo no | "$AVDMANAGER" create avd -n "$AVD" -k "$IMAGE" --force >/dev/null
fi
[ -f "$AVD_DIR/config.ini" ] || die "config.ini de l'AVD $AVD introuvable : $AVD_DIR"
set_prop "$AVD_DIR/config.ini" hw.ramSize 3072
set_prop "$AVD_DIR/config.ini" hw.cpu.ncore 4
set_prop "$AVD_DIR/config.ini" hw.keyboard yes
set_prop "$AVD_DIR/config.ini" hw.gpu.enabled yes
set_prop "$AVD_DIR/config.ini" hw.gpu.mode swiftshader_indirect
set_prop "$AVD_DIR/config.ini" fastboot.forceColdBoot yes
set_prop "$AVD_DIR/config.ini" fastboot.forceFastBoot no
set_prop "$AVD_DIR/config.ini" showDeviceFrame no

# 2. Démarrage à froid si aucun appareil n'est connecté.
DEVICE="$(serial)"
if [ -z "$DEVICE" ]; then
  # Verrous laissés par un émulateur tué brutalement : sans processus vivant, ils sont périmés.
  if ! pgrep -f "qemu-system-x86_64.*${AVD}" >/dev/null 2>&1; then
    find "$AVD_DIR" -maxdepth 1 -name '*.lock' -exec rm -rf {} + 2>/dev/null || true
  fi
  say "démarrage à froid de l'AVD $AVD (sans fenêtre, GPU logiciel)"
  nohup "$EMU" -avd "$AVD" \
    -no-window -no-audio -no-boot-anim -no-snapshot -no-metrics \
    -gpu swiftshader_indirect >"$LOG_DIR/emulator.log" 2>&1 &
  printf '%s\n' "$!" >"$LOG_DIR/emulator.pid"
  # Attente de l'appareil adb (l'émulateur peut mettre ~30 s à ouvrir son port).
  deadline=$(( $(now) + TIMEOUT ))
  while [ -z "$DEVICE" ] && [ "$(now)" -lt "$deadline" ]; do
    sleep 3
    DEVICE="$(serial)"
  done
  [ -n "$DEVICE" ] ||
    { tail -n 20 "$LOG_DIR/emulator.log" >&2 || true; die "aucun appareil adb après $TIMEOUT s (voir $LOG_DIR/emulator.log)"; }
else
  say "appareil déjà connecté : $DEVICE"
fi

# 3. Fin du démarrage.
say "attente de sys.boot_completed sur $DEVICE (au plus ${TIMEOUT} s)"
wait_for_boot "$DEVICE" ||
  { tail -n 20 "$LOG_DIR/emulator.log" >&2 || true; die "$DEVICE n'a pas fini de démarrer (voir $LOG_DIR/emulator.log)"; }

# 4. Version et caractéristiques.
MODEL="$("$ADB" -s "$DEVICE" shell getprop ro.product.model | tr -d '\r\n')"
RELEASE="$("$ADB" -s "$DEVICE" shell getprop ro.build.version.release | tr -d '\r\n')"
SDK_VERSION="$("$ADB" -s "$DEVICE" shell getprop ro.build.version.sdk | tr -d '\r\n')"
SIZE="$("$ADB" -s "$DEVICE" shell wm size | tr -d '\r\n' | awk '{ print $NF }')"
RAM_MB="$("$ADB" -s "$DEVICE" shell cat /proc/meminfo | awk '/MemTotal/ { printf "%d", $2 / 1024 }')"

say "AVD $AVD prêt : $DEVICE"
say "modèle $MODEL — Android $RELEASE (API $SDK_VERSION) — écran $SIZE — RAM ${RAM_MB} Mo"
printf 'pense-bête : bash tools/dev/emulator-down.sh pour l’arrêter, pnpm test:e2e:mobile --tags SPEC-xxxx pour la campagne\n'
