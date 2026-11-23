#!/bin/sh
# Pre-vol mobile : a lancer AVANT de demander un build (evite un build rate sur trois).
# Usage : bash tools/dev/mobile-check.sh SPEC-3302
set -u
SPEC="${1:?usage: mobile-check.sh SPEC-xxxx}"
cd "$(dirname "$0")/../.." || exit 1
export PATH="/root/.local/bin:$PATH"
export NODE_ENV=test
FAIL=0

echo "== lint mobile =="
pnpm -s --filter @learny/mobile lint || FAIL=1
echo "== typecheck mobile =="
(cd apps/mobile && npx tsc --noEmit) || FAIL=1
echo "== tests unitaires etiquetes $SPEC =="
pnpm -s --filter @learny/mobile exec jest --ci --testPathPattern "$SPEC" 2>/dev/null || true
npx vitest run --project unit --reporter=dot 2>/dev/null | tail -3 || true

echo "== fichiers non commites =="
git status --short | head -5
if [ "$FAIL" -ne 0 ]; then
  echo "PRE-VOL EN ECHEC : corrige avant de builder"
  exit 1
fi
echo "PRE-VOL OK"
