#!/usr/bin/env bash
# 학습용 외부 의존성 내려받기 (kotlinc 는 stdlib 만 번들하므로 코루틴은 따로 필요)
set -euo pipefail
LIB="$(cd "$(dirname "$0")/.." && pwd)/lib"
mkdir -p "$LIB"

CORO_VER="1.10.2"
declare -a JARS=(
  "org/jetbrains/kotlinx/kotlinx-coroutines-core-jvm/${CORO_VER}/kotlinx-coroutines-core-jvm-${CORO_VER}.jar"
)

for path in "${JARS[@]}"; do
  name="$(basename "$path")"
  if [ -f "$LIB/$name" ]; then
    echo "✓ $name (이미 있음)"
    continue
  fi
  echo "↓ $name 내려받는 중..."
  curl -fsSL "https://repo1.maven.org/maven2/$path" -o "$LIB/$name"
  echo "✓ $name"
done
