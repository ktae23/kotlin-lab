// lessons/*.md 와 curriculum/lessons.json 을 읽어 정적 사이트용 데이터를 만든다.
// 사용: node scripts/build-site.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LESSONS = path.join(ROOT, "lessons");
const OUT = path.join(ROOT, "site");

// server.ts 의 parseLesson 과 같은 규칙 — 규칙이 갈라지면 로컬과 사이트가 달라진다
function parseLesson(file) {
  const raw = fs.readFileSync(path.join(LESSONS, file), "utf-8");
  const id = file.replace(/\.md$/, "");
  const order = Number.parseInt(id.slice(0, 2), 10) || 999;
  const title = raw.match(/^#\s+(.+)$/m)?.[1].trim() ?? id;

  const starter = raw.match(/```kotlin starter\n([\s\S]*?)```/);
  const expected = raw.match(/```text expected\n([\s\S]*?)```/);
  const prompt = raw.match(/##\s*연습\s*\n([\s\S]*?)(?=```kotlin starter)/);
  const hint = raw.match(/```text hint\n([\s\S]*?)```/);
  const solution = raw.match(/```kotlin solution\n([\s\S]*?)```/);

  const hints = hint
    ? hint[1].split(/^---$/m).map((h) => h.trim()).filter(Boolean)
    : [];

  return {
    id, title, order,
    theory: raw.split(/^##\s*연습\s*$/m)[0].trim(),
    exercise: starter && expected ? {
      prompt: prompt?.[1].trim() ?? "",
      starter: starter[1].replace(/\n$/, ""),
      expected: expected[1].trim(),
      hints,
      solution: solution ? solution[1].replace(/\n$/, "") : null,
    } : null,
  };
}

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "curriculum", "lessons.json"), "utf-8"));
const partOf = {};
for (const p of meta.parts) {
  for (let n = p.range[0]; n <= p.range[1]; n++) partOf[n] = p.name;
}

const lessons = fs.readdirSync(LESSONS)
  .filter((f) => f.endsWith(".md"))
  .map(parseLesson)
  .sort((a, b) => a.order - b.order)
  .map((l) => ({ ...l, part: partOf[l.order] ?? "", week: Math.floor((l.order - 1) / 5) + 1 }));

// 목록과 본문을 분리한다 — 첫 로딩에 50개 본문을 전부 받을 이유가 없다
const DATA = path.join(OUT, "data");
fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });

const index = lessons.map(({ id, title, order, part, week }) => ({ id, title, order, part, week }));
fs.writeFileSync(path.join(DATA, "index.json"), JSON.stringify({ index, parts: meta.parts }));
for (const l of lessons) fs.writeFileSync(path.join(DATA, `${l.id}.json`), JSON.stringify(l));

// Pages 가 _ 로 시작하는 경로를 특수 처리하지 않도록
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0);
const withSol = lessons.filter((l) => l.exercise?.solution).length;
const total = lessons.reduce((a, l) => a + fs.statSync(path.join(DATA, `${l.id}.json`)).size, 0);
console.log(`레슨 ${lessons.length}개 · 정답 ${withSol}개`);
console.log(`  data/index.json   ${kb(path.join(DATA, "index.json"))}KB  (첫 로딩)`);
console.log(`  data/<lesson>.json 합계 ${(total / 1024).toFixed(0)}KB (레슨당 평균 ${(total / lessons.length / 1024).toFixed(0)}KB, 필요할 때만)`);
