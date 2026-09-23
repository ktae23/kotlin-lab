#!/usr/bin/env bash
# 학습 사이트(cairn.today) 를 Caddy 에 올린다.
#
# 비밀번호는 이 스크립트 안에서만 다뤄지고, Caddyfile 에는 bcrypt 해시만 남는다.
# 화면에도 찍히지 않는다.
set -euo pipefail

CF=/home/ubuntu/good-morning/deploy/Caddyfile
USER_NAME=study

command -v docker >/dev/null || { echo "docker 가 필요합니다"; exit 1; }
[ -f "$CF" ] || { echo "Caddyfile 을 찾을 수 없습니다: $CF"; exit 1; }

# ── 비밀번호 입력 ────────────────────────────────────────────────
read -rsp "학습 사이트 비밀번호 (사용자명은 '$USER_NAME'): " PW; echo
[ ${#PW} -ge 8 ] || { echo "8자 이상으로 해주세요"; exit 1; }
read -rsp "한 번 더: " PW2; echo
[ "$PW" = "$PW2" ] || { echo "일치하지 않습니다"; exit 1; }

HASH="$(docker run --rm caddy:2-alpine caddy hash-password --plaintext "$PW")"
unset PW PW2
[ -n "$HASH" ] || { echo "해시 생성 실패"; exit 1; }

# ── 백업 ────────────────────────────────────────────────────────
cp "$CF" "$CF.bak-$(date +%Y%m%d-%H%M%S)"

# ── 기존 블록이 있으면 걷어내고 새로 쓴다 ────────────────────────
python3 - "$CF" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p).read()
# 이전에 추가한 cairn.today 블록 제거 (재실행 가능하게)
s = re.sub(r"\n# ── 학습 사이트[\s\S]*?\n\}\n", "\n", s)
open(p, "w").write(s.rstrip() + "\n")
PY

cat >> "$CF" <<EOF

# ── 학습 사이트 ──────────────────────────────────────────────────
# 과목을 경로로 나눈다. 새 과목은 handle_path 블록만 더하면 된다.
# 백엔드 없음 — Kotlin 실행은 브라우저가 api.kotlinlang.org 로 직접 보낸다.
# 설정: /srv/kotlin-lab/deploy/enable-site.sh (재실행하면 비밀번호만 바뀐다)
cairn.today {
	encode gzip zstd

	# /sw.js 만 인증에서 뺀다. 옛 Cairn PWA 서비스 워커는 이 파일을 받아야
	# 스스로를 지운다 — 401 이면 업데이트가 실패해 옛 워커가 영원히 남고,
	# 그 워커가 캐시를 내주는 동안 사용자는 로그인 창조차 못 본다.
	# 내용은 자기 등록을 해제하는 스크립트뿐이라 노출돼도 잃을 정보가 없다.
	@protected not path /sw.js
	basic_auth @protected {
		$USER_NAME $HASH
	}

	# 옛 Cairn PWA 서비스 워커를 걷어내는 kill-switch. 캐시되면 의미가 없다.
	@sw path /sw.js
	header @sw Cache-Control "no-store"

	redir /kotlin /kotlin/
	handle_path /kotlin/* {
		root * /srv/kotlin-lab/site
		file_server
		@data path /data/*
		header @data Cache-Control "no-cache"
	}

	handle {
		root * /srv/study
		file_server
	}

	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		-Server
	}

	log {
		output stdout
		format console
	}
}
EOF
unset HASH

# ── 검증 후 반영 ────────────────────────────────────────────────
if ! docker run --rm -v "$CF":/etc/caddy/Caddyfile:ro caddy:2-alpine \
     caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  echo "설정이 유효하지 않습니다. 되돌립니다."
  cp "$(ls -t $CF.bak-* | head -1)" "$CF"
  exit 1
fi

docker exec gm-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
sleep 2

echo
echo "굿모닝: HTTP $(curl -s -o /dev/null -m 10 -w '%{http_code}' https://good-morning.cairn.today/)"
echo "학습(인증전): HTTP $(curl -s -o /dev/null -m 10 -w '%{http_code}' https://cairn.today/ 2>/dev/null || echo '000 — DNS A 레코드 필요')"
echo
echo "다음: 가비아에서 A 레코드 추가 →  cairn.today  →  3.35.203.67"
