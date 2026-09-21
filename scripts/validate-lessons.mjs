// 레슨 파일이 server.ts 의 파서 규칙을 만족하는지 검사한다.
// 사용: node scripts/validate-lessons.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lessons");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".md")).sort();

let bad = 0;
let withHint = 0;
let withSol = 0;
for (const f of files) {
  const raw = fs.readFileSync(path.join(DIR, f), "utf-8");
  const errs = [];

  // server.ts 와 동일한 정규식
  const title = raw.match(/^#\s+(.+)$/m);
  const starterAll = raw.match(/```kotlin starter\n([\s\S]*?)```/g) ?? [];
  const expectedAll = raw.match(/```text expected\n([\s\S]*?)```/g) ?? [];
  const hasSection = /^##\s*연습\s*$/m.test(raw);
  const prompt = raw.match(/##\s*연습\s*\n([\s\S]*?)(?=```kotlin starter)/);

  if (!title) errs.push("`# 제목` 없음");
  else if (!/^Lesson \d+ —/.test(title[1].trim())) errs.push(`제목 형식: "${title[1].trim()}"`);
  if (!hasSection) errs.push("`## 연습` 섹션 없음 (단독 줄이어야 함)");
  if (starterAll.length !== 1) errs.push(`kotlin starter 펜스 ${starterAll.length}개 (1개여야 함)`);
  if (expectedAll.length !== 1) errs.push(`text expected 펜스 ${expectedAll.length}개 (1개여야 함)`);
  if (hasSection && starterAll.length === 1 && !prompt) errs.push("연습 설명이 비어 있음");

  const starter = raw.match(/```kotlin starter\n([\s\S]*?)```/);
  if (starter && !/fun\s+main\s*\(/.test(starter[1])) errs.push("starter 에 `fun main()` 없음");

  // 학습 서버 클래스패스에 없는 라이브러리 import 금지
  if (starter) {
    const banned = starter[1].match(/^\s*import\s+(?!kotlin[x]?\.)([\w.]+)/gm);
    if (banned) errs.push(`허용되지 않은 import: ${banned.map((s) => s.trim()).join(", ")}`);
  }

  // 힌트 / 정답 (선택이지만 커버리지를 보고한다)
  const hintBlock = raw.match(/```text hint\n([\s\S]*?)```/);
  const solBlock = raw.match(/```kotlin solution\n([\s\S]*?)```/);
  const hintCount = hintBlock
    ? hintBlock[1].split(/^---$/m).map((h) => h.trim()).filter(Boolean).length
    : 0;
  if (hintBlock && hintCount < 2) errs.push(`힌트 단계 ${hintCount}개 (--- 로 2단계 이상 나눠야 함)`);
  if (solBlock && !/fun\s+main\s*\(/.test(solBlock[1])) errs.push("정답에 `fun main()` 없음");
  if (solBlock) {
    const banned = solBlock[1].match(/^\s*import\s+(?!kotlin[x]?\.)([\w.]+)/gm);
    if (banned) errs.push(`정답에 허용되지 않은 import: ${banned.map((s) => s.trim()).join(", ")}`);
  }
  if (hintCount) withHint++;
  if (solBlock) withSol++;

  // println(TODO()) 은 Nothing 이 모든 오버로드에 매칭돼 "overload resolution ambiguity" 로 깨진다.
  // 학습자가 첫 실행에서 레슨과 무관한 에러를 보게 되므로 금지한다.
  if (starter && /println\s*\(\s*TODO\s*\(/.test(starter[1])) {
    errs.push("starter 에 `println(TODO())` — 오버로드 모호성으로 컴파일 실패함. 타입 명시된 val 로 받을 것");
  }

  const theoryLines = raw.split(/^##\s*연습\s*$/m)[0].trim().split("\n").length;

  if (errs.length) {
    bad++;
    console.log(`✗ ${f}`);
    for (const e of errs) console.log(`    - ${e}`);
  } else {
    console.log(`✓ ${f}  (이론 ${theoryLines}줄, 힌트 ${hintCount}단계, 정답 ${solBlock ? "○" : "✗"})`);
  }
}

console.log(`\n${files.length}개 중 ${files.length - bad}개 통과, ${bad}개 실패`);
console.log(`힌트 ${withHint}/${files.length} · 정답 ${withSol}/${files.length}`);
process.exit(bad ? 1 : 0);
