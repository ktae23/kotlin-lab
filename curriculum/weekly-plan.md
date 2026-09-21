# 8주 주간 학습 계획 (Weekly Plan)

> 하루 1시간 × 주 5일. 모든 주차가 **레슨 3일 + 주간 미션 1일 + 복습·회고 1일** 구조다.
> 미션은 회사 코드나 개인 프로젝트에 적용하는 게 원칙 — 연습용 예제로 때우면 남는 게 없다.

전체 지도는 [`roadmap.md`](roadmap.md), 진도 기록은 [`progress.md`](progress.md).

---

## Week 1 (언어) — 기본기 — 타입과 불변

| 일차 | 내용 | 초점 |
|---|---|---|
| Day 1 | **L1 null 안정성** | `?.` `?:` `!!` `let`. Java의 `@Nullable`이 타입으로 강제되는 전환 |
| Day 2 | **L2 val / var** | `val`이 기본인 이유. `final`과 같고 다른 점 |
| Day 3 | **L3 data class** | Lombok 한 덩어리가 한 줄로. `copy()`와 구조 분해 |
| Day 4 | **주간 미션** | 회사 Java DTO 3개를 Kotlin data class로 이식. 줄 수 비교 |
| Day 5 | **복습 + 회고** | 연습 3개 다시 풀기. 아래 회고 질문 답변 |

**회고 질문** — 5일차에 글로 답한다. 말로 얼버무리면 아는 게 아니다.

1. Java에서 NPE로 장애 낸 경험을 Kotlin 타입 시스템은 어디서 막았을까?
2. `val list`인데 `list.add()`가 되는 이유를 설명할 수 있나?
3. data class를 쓰면 안 되는 상황이 있을까? (7주차 복선)

---

## Week 2 (언어) — 보일러플레이트 소멸

| 일차 | 내용 | 초점 |
|---|---|---|
| Day 1 | **L4 확장 함수·스코프 함수** | `StringUtils`가 사라진다. `let/run/with/apply/also` 구분 |
| Day 2 | **L5 sealed class · when** | enum + switch → 컴파일 타임 완전성 검증 |
| Day 3 | **L6 컬렉션 API** | `.stream().collect()` 없이. eager vs `asSequence()` |
| Day 4 | **주간 미션** | `XxxUtils` 유틸 클래스 하나를 골라 확장 함수로 리팩터링 |
| Day 5 | **복습 + 회고** | 스코프 함수 5개를 언제 쓰는지 표로 정리 |

**회고 질문** — 5일차에 글로 답한다. 말로 얼버무리면 아는 게 아니다.

1. 확장 함수는 정말 클래스에 메서드를 추가하는가? 디컴파일하면 뭐가 보일까?
2. `when`에 `else`를 안 써도 되는 조건은?
3. 100만 건 컬렉션에서 `filter().map()`을 그냥 쓰면 무슨 일이 생기나?

---

## Week 3 (언어) — 함수형과 추상화

| 일차 | 내용 | 초점 |
|---|---|---|
| Day 1 | **L7 람다·고차 함수** | 함수 타입, 후행 람다, `inline`이 필요한 이유 |
| Day 2 | **L8 제네릭·변성** | `out`/`in` vs `? extends`/`? super`. `reified` |
| Day 3 | **L9 위임 (by)** | 클래스 위임으로 데코레이터. `by lazy` |
| Day 4 | **주간 미션** | 반복되는 try-catch-로깅 블록을 고차 함수로 추출해 중복 제거 |
| Day 5 | **복습 + Phase 1 체크포인트** | roadmap.md의 Week 3 체크포인트 3문항 답변 |

**회고 질문** — 5일차에 글로 답한다. 말로 얼버무리면 아는 게 아니다.

1. `inline`을 안 붙이면 람다 하나당 무엇이 생기나?
2. `List<out T>`가 Kotlin에서 기본인데 Java `List<T>`는 왜 불변(invariant)인가?
3. 상속 대신 위임을 써야 하는 판단 기준은?

---

## Week 4 (동시성) — 코루틴 — 스레드를 안 묶는 법

| 일차 | 내용 | 초점 |
|---|---|---|
| Day 1 | **L10 코루틴 기초** | `suspend`의 정체(CPS). 구조적 동시성 |
| Day 2 | **L11 디스패처·취소** | `withContext`, 협조적 취소, `withTimeout` |
| Day 3 | **L12 async/await 병렬** | 순차 3초 → 병렬 1초. `SupervisorJob`으로 실패 격리 |
| Day 4 | **주간 미션** | 순차 호출 3개짜리 실제 코드를 찾아 병렬로 전환. 전후 응답 시간 측정 |
| Day 5 | **복습 + 회고** | 스레드풀 고갈 시나리오를 그림으로 그려보기 |

**회고 질문** — 5일차에 글로 답한다. 말로 얼버무리면 아는 게 아니다.

1. 톰캣 스레드 200개가 전부 I/O 대기 중이면 무슨 일이 생기나? 코루틴은 왜 다른가?
2. `launch`로 띄운 코루틴에서 예외가 나면 부모는 어떻게 되나?
3. 취소가 왜 `CancellationException`이라는 예외로 구현됐을까?

---

## Week 5 (동시성) — Flow — 흐르는 데이터

| 일차 | 내용 | 초점 |
|---|---|---|
| Day 1 | **L13 Flow 기초** | 콜드 스트림. `List`가 아니라 `Flow`여야 하는 이유 |
| Day 2 | **L14 Flow 연산자·배압** | `buffer`/`conflate`/`collectLatest`, `flowOn` |
| Day 3 | **L15 코루틴 예외 처리** | `launch` vs `async` 전파 차이, `CoroutineExceptionHandler` |
| Day 4 | **주간 미션** | 대량 데이터 배치 처리 코드를 Flow로 재작성 (메모리 사용량 비교) |
| Day 5 | **복습 + Phase 2 체크포인트** | roadmap.md의 Week 5 체크포인트 3문항 답변 |

**회고 질문** — 5일차에 글로 답한다. 말로 얼버무리면 아는 게 아니다.

1. Reactor `Flux`를 써봤다면, Flow와 결정적 차이는 무엇인가?
2. `try/catch`로 Flow 내부 예외를 잡으면 왜 안 되나?
3. 생산자가 소비자보다 빠를 때 선택지 3가지는?

---

## Week 6 (실전) — Spring Boot + Kotlin

| 일차 | 내용 | 초점 |
|---|---|---|
| Day 1 | **L16 셋업** | `build.gradle.kts`, allOpen/noArg가 필요한 근본 이유, `-Xjsr305=strict` |
| Day 2 | **L17 DI·설정 바인딩** | 생성자 주입 한 줄, `@ConfigurationProperties` data class |
| Day 3 | **L18 웹 계층** | DTO 분리, `@field:NotBlank` use-site target, `@RestControllerAdvice` |
| Day 4 | **주간 미션** | Spring Boot 3.3 + Kotlin 프로젝트를 맨손으로 부트스트랩 (start.spring.io 금지) |
| Day 5 | **복습 + 회고** | allOpen을 끄고 `@Transactional`을 붙여 실제로 안 먹는 걸 눈으로 확인 |

**회고 질문** — 5일차에 글로 답한다. 말로 얼버무리면 아는 게 아니다.

1. Kotlin 클래스가 기본 `final`인 게 왜 Spring과 충돌하나?
2. `@field:`를 안 붙이면 검증 애노테이션은 어디에 붙는가?
3. data class에 Jackson 역직렬화가 실패하는 이유와 해결은?

---

## Week 7 (실전) — JPA — Kotlin만의 지뢰밭

| 일차 | 내용 | 초점 |
|---|---|---|
| Day 1 | **L19 엔티티 함정** | **data class 엔티티 금지**. `var`, nullable id, noArg |
| Day 2 | **L20 타입 세이프 쿼리** | QueryDSL/Kotlin JDSL, 동적 쿼리 조립 |
| Day 3 | **L21 트랜잭션·N+1** | 프록시가 안 먹는 3가지, fetch join, `@EntityGraph`, OSIV |
| Day 4 | **주간 미션** | 엔티티 + 리포지토리 작성 → N+1 재현 → 쿼리 로그로 확인 → 해결 |
| Day 5 | **복습 + 회고** | Week 1의 'data class 최고'가 왜 여기서 뒤집혔는지 정리 |

**회고 질문** — 5일차에 글로 답한다. 말로 얼버무리면 아는 게 아니다.

1. 엔티티에 `copy()`가 있으면 무슨 사고가 나나?
2. `@Transactional`이 조용히 무시되는 경우 3가지를 즉답할 수 있나?
3. OSIV를 끄면 무엇이 좋아지고 무엇이 불편해지나?

---

## Week 8 (실전) — 마무리 — 졸업 과제

| 일차 | 내용 | 초점 |
|---|---|---|
| Day 1 | **L22 테스트** | Kotest 스펙 스타일, MockK `coEvery`, `runTest` 가상 시간 |
| Day 2 | **L23 코루틴 vs 가상 스레드** | JDK 21 virtual threads와의 관계. 언제 무엇을 |
| Day 3 | **L24 졸업 과제** | 전체 종합 설계 — 도메인, sealed 결과 타입, 병렬 조회 |
| Day 4 | **미니 API 완성** | Week 6~8 산출물을 하나의 동작하는 API로 통합 + 테스트 |
| Day 5 | **이력서 문장 작성** | 이 프로젝트를 이력서 3문장으로. Week 8 체크포인트 답변 |

**회고 질문** — 5일차에 글로 답한다. 말로 얼버무리면 아는 게 아니다.

1. 이 프로젝트에서 Kotlin이 실제로 무엇을 막아줬는지 사례로 말할 수 있나?
2. 같은 걸 Java로 했다면 어디가 더 길고 어디가 더 안전했을까?
3. 면접관이 '왜 코루틴이죠? 가상 스레드로 충분하지 않나요?'라 물으면?

---

## 완주 원칙

- **하루 1시간을 넘기지 않는다.** 주말에 몰아치면 3주차에 멈춘다.
- **미션을 건너뛰지 않는다.** 레슨만 듣는 8주는 유튜브 시청과 같다.
- **막히면 다음 날로 넘어간다.** 한 레슨에 이틀 이상 쓰지 말고, 막힌 지점만 메모해두고 진행한다.
- **회고 질문에 답을 못 쓰겠으면 그 레슨을 다시 본다.** 이게 유일한 실질 게이트다.
