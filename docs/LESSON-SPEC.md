# 레슨 집필 규격

이 레포의 레슨 파일은 학습 서버(`server.ts`)가 파싱한다. **형식이 어긋나면 레슨이 깨진다.**

## 대상 독자

**Java/Spring 5년차 백엔드 개발자.** 목표는 "Kotlin 문법을 안다"가 아니라
**"실무에서 Kotlin 코드 품질을 검토하고 개선을 제안할 수 있다"** 이다.

따라서:
- 문법 나열이 아니라 **왜 이 설계인가**를 설명한다
- **Java 코드 → Kotlin 코드 대조**가 설명의 뼈대다
- 표준 라이브러리는 "이런 게 있다"가 아니라 **"직접 만들지 말고 이걸 써라"** 관점으로
- 리뷰에서 지적할 수 있게 **안티패턴을 명시**한다 ("이런 코드를 보면 이렇게 지적한다")

## 톤

20년차 시니어 백엔드 선배가 후배에게 밥 먹으며 조언하는 느낌. 따뜻하지만 직설적.
한국어, 기술 용어는 영어 병기. 겁주기가 아니라 **실무 연결**("이걸 알면 이런 상황에서 살아남아").
면접관 시점 코멘트를 자연스럽게 섞는다.

## 파일 형식

파일명: `lessons/NN-slug.md` (NN은 두 자리)

````markdown
# Lesson N — 제목

...이론 (마크다운)...

## 연습

연습 문제 설명

```kotlin starter
fun main() {
    // TODO: 채울 부분
}
```

```text expected
기대 출력
```

```text hint
1단계 — 개념만 짚는다. 답은 주지 않는다.
---
2단계 — 어떤 도구(함수/키워드)를 쓰는지.
---
3단계 — 구조와 그 이유. 흔히 걸리는 함정도.
---
4단계 — 뼈대를 보여주되 빈칸 `___` 을 남긴다.
```

```kotlin solution
fun main() {
    // 완전히 동작하는 전체 풀이
}
```
````

### 엄격한 규칙

| 항목 | 규칙 |
|---|---|
| 제목 | `# Lesson N — 제목` 정확히 이 형식, 파일당 1개 |
| 섹션 | `## 연습` 정확히 이 문자열, 단독 줄, 1개 |
| 펜스 | ` ```kotlin starter `, ` ```text expected `, ` ```text hint `, ` ```kotlin solution ` — **각 1개씩**, 이름까지 정확히 |
| starter | `fun main()` 필수, 채울 곳은 `// TODO:` |
| 힌트 | `---` 단독 줄로 3~4단계. 인라인 마크다운만(여러 줄 코드 블록 금지) |
| 정답 | `fun main()` 포함 **전체 파일**. 핵심 판단은 주석 1~2줄 |
| 이론 분량 | 120~170줄 |

### 클래스패스 제약 — 어기면 컴파일 실패

학습 서버는 `kotlinc` 로 **단일 파일**을 컴파일한다. 클래스패스에는
**kotlin-stdlib 와 kotlinx-coroutines 1.10.2 밖에 없다.**

`starter` 와 `solution` 블록에서:
- ✅ `kotlin.*`, `kotlinx.coroutines.*`, `java.*` (정규화된 이름으로 쓰면 import 없이 가능)
- ❌ `org.springframework`, `jakarta.*`, `com.querydsl`, Kotest, MockK, JUnit, Gradle API

Spring·JPA·Gradle 을 다루는 레슨은 **이론 본문에서는 실제 코드를 마음껏 보여주되**,
연습은 **그 메커니즘을 순수 Kotlin 으로 재현**하도록 설계한다.
(예: Gradle 의존성 해석 → 순수 Kotlin 으로 의존성 그래프를 만들고 충돌 해결 규칙 구현)

### 출력 결정성

`expected` 와 대조 채점하므로 **출력이 항상 동일**해야 한다.
- ❌ 실행 시간, 스레드 이름, 해시코드, `Set`/`Map` 순회 순서에 의존하는 출력
- 코루틴은 `delay` 시간차를 크게 벌려 순서를 확정하거나, 결과를 모아 정렬 후 출력

## 검증 (필수)

작성 후 반드시:

1. 레슨 파일에서 `kotlin solution` 블록을 **다시 추출**해 `Main.kt` 로 저장
2. `kotlinc Main.kt -d out -nowarn [-cp <coroutines jar>]`
3. `kotlin -cp "out[:<jar>]" MainKt`
4. 출력이 같은 파일의 `text expected` 와 **바이트 단위로 일치**하는지 `diff` 확인
5. 코루틴을 쓰면 **3회 반복 실행해 출력 동일** 확인
6. 불일치하면 **정답을 고친다** (expected 를 고치지 않는다)

마지막으로 레포 루트에서:

```bash
node scripts/validate-lessons.mjs     # 형식 + 힌트/정답 커버리지
node scripts/verify-solutions.mjs     # 전 레슨 정답 컴파일·실행 대조
```

## 참고 사례

`lessons/08-null-safety.md` — 이론·연습·힌트 4단계·정답이 모두 갖춰진 완성 사례.
새 레슨을 쓰기 전에 반드시 읽고 톤과 구조를 맞출 것.
