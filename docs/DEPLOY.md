# 배포 — 기존 Lightsail 서버 + Caddy

이미 도는 서버에 **정적 파일만** 얹는다. 새 서비스도, 새 포트도, 시크릿도 없다.

```
인터넷 → Caddy(:443, 자동 HTTPS) → /srv/kotlin-lab/site  (정적 파일)
브라우저 → api.kotlinlang.org                            (Kotlin 실행)
```

## 전제

| | |
|---|---|
| 서버 | Lightsail 4GB / 2 vCPU — **언제한번·굿모닝이 이미 산다** |
| 프록시 | Caddy (자동 HTTPS), `meetsometime-ops/apply/Caddyfile` 관례를 따른다 |
| DNS | 가비아. `cairn.today` 서브도메인 사용 |
| SSH | 22번이 특정 IP 에만 열려 있다 — **밖에서 밀어 넣지 않는다** |

## 왜 self-hosted 러너를 안 쓰나

mentorlog 는 러너가 받아서 띄웠다. kotlin-lab 은 **정적 파일뿐이라 그럴 필요가 없다.**

- 개인 계정이라 러너는 **레포마다** 등록해야 한다 (`mentorlog-lightsail` 은 mentorlog 전용)
- 4GB 에 러너 프로세스를 하나 더 상주시키는 값을 치를 이유가 없다
- kotlin-lab 은 **public** 이라 `git pull` 에 자격증명이 필요 없다

그래서 **서버가 주기적으로 당겨간다.** 들어오는 문은 그대로 0개다.

## 왜 서버에서 빌드하지 않나

`site/` 는 **레포에 빌드된 채로 커밋**되어 있다. 서버는 받아서 그대로 내려주기만 한다.
mentorlog 가 "만드는 곳과 도는 곳을 가른" 것과 같은 이유 — 옆 서비스 둘을 느리게 만들지 않는다.

레슨을 고쳤으면 **로컬에서** 빌드하고 커밋한다:

```bash
npm run build:site && git add site && git commit && git push
```

---

## 처음 한 번

### 1. DNS (USER_ACTION)

가비아에서 A 레코드 추가:

```
kotlin.cairn.today  →  3.35.203.67
```

### 2. 서버에 받기

```bash
sudo mkdir -p /srv/kotlin-lab && sudo chown "$USER" /srv/kotlin-lab
git clone --depth 1 https://github.com/ktae23/kotlin-lab.git /srv/kotlin-lab
```

### 3. 비밀번호 해시 (USER_ACTION)

```bash
docker run --rm caddy:2-alpine caddy hash-password --plaintext '원하는_비밀번호'
```

출력된 `$2a$...` 를 다음 단계에서 쓴다. **이 값만 서버에 남고 레포에는 안 들어간다.**

### 4. Caddy

`deploy/Caddyfile.snippet` 의 블록을 서버 Caddyfile 에 붙이고,
`REPLACE_WITH_BCRYPT_HASH` 를 3번 출력으로 바꾼다.

```bash
caddy validate --config /etc/caddy/Caddyfile   # 또는 docker compose exec caddy ...
sudo systemctl reload caddy
```

### 5. 자동 동기화

```bash
sudo cp /srv/kotlin-lab/deploy/kotlin-lab-sync.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kotlin-lab-sync.timer
systemctl list-timers kotlin-lab-sync   # 다음 실행 시각 확인
```

10분마다 `git pull` 한다. 급하면 `sudo systemctl start kotlin-lab-sync`.

### 6. 확인

```bash
curl -sI https://kotlin.cairn.today/ | head -1     # 401 이어야 한다 (basic_auth)
curl -sI -u kotlin:비밀번호 https://kotlin.cairn.today/ | head -1   # 200
```

브라우저로 열어 로그인 → 레슨 50개가 보이면 끝이다.

---

## 평소

레슨을 고쳤을 때:

```bash
npm run build:site
git add -A && git commit -m "..." && git push
```

10분 안에 서버가 받아간다.

## 진도 옮기기

`localStorage` 라 브라우저마다 따로다. 브라우저 콘솔에서:

```js
copy(localStorage.getItem("kotlin-lab:progress:v1"))              // 내보내기
localStorage.setItem("kotlin-lab:progress:v1", '<붙여넣기>')       // 가져오기
```

자주 옮기게 되면 그때 동기화를 붙인다. 지금 구조를 바꾸지 않아도 된다.

## 구글 로그인으로 바꾸고 싶으면

`basic_auth` 자리를 `forward_auth` 로 바꾸고 oauth2-proxy 컨테이너를 올린다.
mentorlog 의 Google OAuth 클라이언트에 리디렉션 URI 만 추가하면 재사용된다.

다만 **컨테이너가 하나 더 뜬다.** 4GB 에 서비스 둘이 이미 사는 상황이라,
혼자 쓰는 학습 사이트에는 basic_auth 로 충분하다고 본다.

## 하지 말 것

- **`server.ts`(로컬 학습 서버)를 이 서버에 올리지 말 것.** 받은 Kotlin 코드를 `kotlinc` 로
  직접 실행하므로 공개하는 순간 임의 코드 실행 서버가 된다. 루프백 전용이다
- **직접 계정·비밀번호 시스템을 만들지 말 것.** 지킬 데이터가 없는데 공격 표면만 늘어난다
