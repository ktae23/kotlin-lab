# 배포 — Cloudflare Pages + Access

정적 사이트(`site/`)를 Cloudflare Pages 에 올리고, 그 앞에 **Cloudflare Access** 로 SSO 를 건다.
나만 접속할 수 있게 되므로 학습 진도도 자연히 보호된다.

## 왜 이 조합인가

| | |
|---|---|
| **백엔드 없음** | Kotlin 실행은 JetBrains 공개 컴파일 API(`api.kotlinlang.org`)가 한다. 이 사이트는 정적 파일뿐이라 RCE·인젝션 표면이 없고 `.env` 도 없다 |
| **직접 만든 인증 없음** | Access 가 SSO 를 대신 처리한다. 비밀번호 저장·세션 관리·재설정 플로우를 만들지 않으므로 그만큼의 취약점도 없다 |
| **진도는 브라우저에만** | `localStorage`. 서버로 나가는 학습 기록이 없다 |
| **비용** | Pages 무료, Access 무료 플랜 50명까지 |

## 1. 빌드

```bash
npm run build:site     # = node scripts/build-site.mjs
```

`lessons/*.md` → `site/data/index.json` + `site/data/<레슨id>.json`.
레슨을 고치면 **반드시 다시 빌드**해야 사이트에 반영된다.

로컬 확인:

```bash
npm run preview        # http://127.0.0.1:4173
```

## 2. Cloudflare 로그인

브라우저 OAuth 라 직접 실행해야 한다. Claude Code 라면 `!` 를 붙여 이 세션에서 돌릴 수 있다.

```bash
npx wrangler login
```

## 3. Pages 에 배포

```bash
npm run deploy         # = wrangler pages deploy site --project-name kotlin-lab
```

첫 실행 때 프로젝트 생성 여부를 묻는다. 끝나면 `https://kotlin-lab.pages.dev` 같은 주소가 나온다.

> 이 시점에는 **아직 공개 상태**다. 다음 단계까지 끝내야 나만 볼 수 있다.

## 4. Cloudflare Access 로 잠그기

Cloudflare 대시보드에서 (코드 없음):

1. **Zero Trust** → 처음이면 팀 도메인(`<팀이름>.cloudflareaccess.com`) 을 정한다
2. **Settings → Authentication → Login methods** 에서 **Google** 또는 **GitHub** 추가
   - One-time PIN(이메일로 코드 전송)만 써도 된다. 이 경우 IdP 설정이 아예 필요 없다
3. **Access → Applications → Add an application → Self-hosted**
   - Application domain: `kotlin-lab.pages.dev` (또는 연결한 커스텀 도메인)
   - Session duration: `1 month` 정도 (자주 로그인하지 않게)
4. **Policy** 하나 추가
   - Action: **Allow**
   - Include → **Emails** → 본인 이메일만
5. 저장 후 시크릿 창으로 접속 → 로그인 화면이 뜨면 성공

### 확인

```bash
curl -sI https://kotlin-lab.pages.dev | head -1
```

Access 가 걸려 있으면 로그인 페이지로 리다이렉트(`302`)된다. `200` 이면 아직 공개 상태다.

## 5. 레슨을 고쳤을 때

```bash
npm run build:site && npm run deploy
```

## 진도 옮기기

`localStorage` 라서 브라우저마다 따로다. 기기를 옮길 때는 콘솔에서:

```js
// 내보내기 — 출력된 JSON 을 복사
copy(localStorage.getItem("kotlin-lab:progress:v1"))

// 가져오기 — 붙여넣기
localStorage.setItem("kotlin-lab:progress:v1", '<붙여넣기>')
```

자주 옮기게 되면 그때 GitHub OAuth + Gist 동기화를 붙이면 된다. 지금 구조를 바꾸지 않아도 된다.

## 하지 말 것

- **로컬 서버(`server.ts`)를 공개 배포하지 말 것.** 받은 Kotlin 코드를 `kotlinc` 로 직접 실행하므로 공개하는 순간 임의 코드 실행 서버가 된다. 루프백 전용이다
- **직접 계정/비밀번호를 만들지 말 것.** 지킬 데이터가 없는데 공격 표면만 늘어난다
