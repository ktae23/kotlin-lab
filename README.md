# Kotlin Lab

**Java/Spring 백엔드 개발자를 위한 Kotlin 8주 학습 레포.**
레슨 24개 + 브라우저 학습 서버 + 진도 관리 + Claude Code 스킬.

하루 1시간 × 주 5일 = **40시간**. 문법 입문이 아니라 **Kotlin + Spring Boot 3.3 으로 API를 설계할 수 있는 수준**까지.

```
📚 커리큘럼    curriculum/roadmap.md · weekly-plan.md · progress.md
📖 레슨        lessons/01~24
🖥  학습 서버   node server.ts → localhost:3838
🤖 스킬        /kotlin
```

---

## 빠른 시작

```bash
# 사전 준비
brew install kotlin          # kotlinc 필요
node --version               # 22+ (타입 스트리핑)

# 의존성 (코루틴 레슨용)
bash scripts/fetch-deps.sh

# 서버 기동
npm start                    # = node server.ts
open http://localhost:3838
```

Claude Code 를 쓴다면 `/kotlin` 한 번이면 위 과정이 전부 자동입니다.

---

## 8주 구조

| Phase | Week | 레슨 | 무엇을 얻나 |
|---|---|---|---|
| **언어** | 1~3 | L1~L9 | Java 개발자가 사고방식을 바꿔야 하는 지점. null 안정성, sealed, 확장 함수, 변성, 위임 |
| **동시성** | 4~5 | L10~L15 | 코루틴과 Flow. 구조적 동시성, 취소 전파, 배압, 예외 규칙 |
| **실전** | 6~8 | L16~L24 | Spring Boot + JPA 를 Kotlin 으로 쓸 때만 있는 함정. 그리고 졸업 과제 |

각 주는 **레슨 3일 + 주간 미션 1일 + 복습·회고 1일**.
미션은 연습 예제가 아니라 **회사 코드/개인 프로젝트에 적용**하는 게 원칙입니다.

전체 지도 → [`curriculum/roadmap.md`](curriculum/roadmap.md)
일자별 계획 → [`curriculum/weekly-plan.md`](curriculum/weekly-plan.md)
진도 기록 → [`curriculum/progress.md`](curriculum/progress.md)

---

## 학습 서버

의존성 없이 Node 내장 모듈만 씁니다. 루프백(`127.0.0.1`)에만 바인딩 — 임의 Kotlin 코드를 실행하므로 외부에 열지 마세요.

### 두 가지 모드

**1. 웹 에디터** — 브라우저에서 작성 → `⌘↵` → 컴파일·실행 결과와 기대 출력 자동 대조

**2. 파일 감지** — 사이드바에 IntelliJ 프로젝트 경로를 넣고 **감지 시작**. 그 아래 `.kt` 파일을 저장하면 자동으로 컴파일·실행되어 결과가 브라우저로 밀려옵니다 (SSE).
- 하위 디렉터리까지 감지, `build/ out/ target/ .gradle/ .idea/` 무시
- `fun main()` 없는 파일은 건너뜀

### 클래스패스

`lib/*.jar` 이 컴파일·실행 클래스패스에 자동으로 얹힙니다.
`kotlinc` 는 stdlib 만 번들하므로 코루틴 레슨(Week 4~5)에는 `kotlinx-coroutines-core-jvm` 이 필요합니다 — `scripts/fetch-deps.sh` 가 받아옵니다. (jar 은 git 미추적)

---

## 레슨 추가하기

`lessons/NN-slug.md` 하나만 만들면 서버가 자동 인식합니다.

````markdown
# Lesson N — 제목

...이론 (마크다운)...

## 연습

문제 설명

```kotlin starter
fun main() {
    // TODO:
}
```

```text expected
기대 출력
```

```text hint
1단계 — 개념만 짚어준다
---
2단계 — 어떤 도구를 쓰는지
---
3단계 — 뼈대에 빈칸 `___` 남기기
```

```kotlin solution
fun main() {
    // 완전히 동작하는 전체 풀이
}
```
````

- `# ` 제목이 사이드바 항목
- `## 연습` 위쪽이 이론 패널, 아래쪽이 연습 패널
- 펜스 정보 문자열은 **이름까지 정확히** 맞아야 파싱됩니다 — ` ```kotlin starter `, ` ```text expected `, ` ```text hint `, ` ```kotlin solution `
- `hint` 와 `solution` 은 **선택**입니다. 없으면 버튼이 비활성화될 뿐 나머지는 정상 동작합니다
- 힌트는 `---` 단독 줄로 나누면 **한 단계씩** 공개됩니다
- 연습·정답 코드는 **stdlib + kotlinx-coroutines 만** 쓸 수 있습니다 (Spring/JPA import 불가)

검증: `node scripts/validate-lessons.mjs` — 형식과 힌트·정답 커버리지를 함께 보고합니다.

### 힌트 / 정답 버튼

연습 패널 상단에 있습니다.

- **힌트** — 누를 때마다 한 단계씩 공개 (`힌트 (4)` → `힌트 더 보기 (2/4)` → …)
- **정답** — 실수로 여는 걸 막기 위해 **두 번** 눌러야 열립니다. 열린 뒤 `에디터에 넣기` 로 바로 적용 가능
- 레슨을 바꾸면 초기화됩니다

---

## 워크스페이스

웹 에디터에서 실행할 때마다 코드가 `workspace/<레슨id>.kt` 로 저장됩니다.
다시 열면 이어서 작업할 수 있고, Sublime 이나 IntelliJ 로 열어도 됩니다. (git 미추적)

---

## `/kotlin` 스킬

`.claude/skills/kotlin/` 에 들어 있습니다. `~/.claude/skills/kotlin` 으로 심볼릭 링크하면 전역에서 쓸 수 있습니다.

```bash
# 레포 루트에서 실행 — 클론 위치가 어디든 상관없습니다
mkdir -p ~/.claude/skills
ln -sfn "$(pwd)/.claude/skills/kotlin" ~/.claude/skills/kotlin
```

스킬은 이 심볼릭 링크를 역추적해 레포 위치를 스스로 찾습니다. 다른 곳에 두었다면 `KOTLIN_LAB_DIR` 환경변수로 알려주세요.

| 명령 | 동작 |
|---|---|
| `/kotlin` | 진도 확인 → 오늘 레슨 브리핑 → 서버 기동 → 브라우저 |
| `/kotlin 진도` | 완료 레슨 / 남은 기간 / 막힌 지점 |
| `/kotlin 레슨 12` | 특정 레슨으로 이동 |
| `/kotlin 복습` | 완료 레슨에서 판단형 퀴즈 출제 |
| `/kotlin 미션` | 현재 주차 미션 안내 + 결과 리뷰 |
| `/kotlin 서버 꺼줘` | 서버 종료 |
