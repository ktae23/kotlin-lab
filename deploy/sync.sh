#!/usr/bin/env bash
# kotlin-lab 최신본을 받아온다. public 레포라 자격증명이 필요 없다.
#
# 서버가 GitHub 로 '밖으로' 연결하므로 들어오는 문을 하나도 열지 않는다.
# (mentorlog 가 self-hosted 러너를 쓴 이유와 같은 판단. 다만 이쪽은
#  정적 파일뿐이라 러너 없이 git pull 로 충분하다.)
set -euo pipefail

REPO="https://github.com/ktae23/kotlin-lab.git"
DIR="${KOTLIN_LAB_DIR:-/srv/kotlin-lab}"

if [ ! -d "$DIR/.git" ]; then
  echo "처음 받는 중: $DIR"
  git clone --depth 1 "$REPO" "$DIR"
else
  cd "$DIR"
  before="$(git rev-parse HEAD)"
  git fetch --depth 1 origin main --quiet
  git reset --hard origin/main --quiet
  after="$(git rev-parse HEAD)"
  if [ "$before" = "$after" ]; then
    echo "변경 없음 ($(git log -1 --format='%h %s'))"
    exit 0
  fi
fi

cd "$DIR"
# site/ 는 레포에 이미 빌드되어 들어 있다. 서버에서 빌드하지 않는다 —
# 4GB / 2 vCPU 에 서비스가 둘 더 살고 있어 빌드 부하를 얹지 않는다.
test -f site/index.html || { echo "site/index.html 이 없다. 빌드 산출물이 커밋됐는지 확인"; exit 1; }
n=$(ls site/data/*.json 2>/dev/null | wc -l)

# 허브 페이지도 같이 반영한다 (경로로 과목을 나누므로 / 는 허브가 받는다)
HUB="${STUDY_HUB_DIR:-/srv/study}"
if [ -d "$HUB" ] && [ -w "$HUB" ]; then
  cp deploy/hub/index.html "$HUB/index.html"
  echo "허브 갱신: $HUB/index.html"
fi

echo "갱신 완료: $(git log -1 --format='%h %s')  (레슨 데이터 ${n}개)"
