#!/usr/bin/env bash
set -uo pipefail

ARC_FOUNDRY_COMMIT="d497beea"
CIRCOM_VERSION="2.2.3"

fail=0

check() {
  local name=$1 expected=$2 actual=$3
  if [[ "$actual" == *"$expected"* ]]; then
    printf 'ok   %-10s %s\n' "$name" "$actual"
  else
    printf 'FAIL %-10s expected "%s", got "%s"\n' "$name" "$expected" "${actual:-missing}"
    fail=1
  fi
}

first_line() { "$@" 2>/dev/null | head -n1 || true; }

check node "v24" "$(first_line node --version)"
check pnpm "11.27.1" "$(first_line pnpm --version)"
check circom "$CIRCOM_VERSION" "$(first_line circom --version)"

for bin in arc-forge arc-cast arc-anvil; do
  check "$bin" "1.7.1-dev" "$(first_line "$bin" --version)"
done

check arc-forge-sha "$ARC_FOUNDRY_COMMIT" "$(arc-forge --version 2>/dev/null | grep 'Commit SHA' || true)"

if arc-forge test --help 2>/dev/null | grep -q -- '--network'; then
  printf 'ok   %-10s %s\n' arc-network "arc-forge test supports --network"
else
  printf 'FAIL %-10s %s\n' arc-network "arc-forge test lacks --network"
  fail=1
fi

exit "$fail"
