#!/usr/bin/env node
// Writes a patch file that re-orders each school's exam steps chronologically (by the earliest date in
// applyStart/applyEnd/examDate/resultDate). Needed because apply_patches.js addStep always appends at the end.
// Dorm steps are left where they are. Usage: node reorder_steps.js <out-patch.json>   (then apply it with apply_patches.js)
const fs = require('fs');
const L = require('./lib.js');
const out = process.argv[2];
if (!out) { console.error('usage: node reorder_steps.js <out-patch.json>'); process.exit(1); }
const S = L.loadData().SCHOOLS;
const firstDate = st => {
  const ds = ['applyStart','applyEnd','examDate','resultDate']
    .map(f => String(st[f] || '').match(/\d{4}-\d{2}-\d{2}/)).filter(Boolean).map(m => m[0]).sort();
  return ds[0] || '9999-99-99';
};
const ops = [], report = [];
for (const s of S) {
  const exams = (s.steps || []).filter(st => st.type === 'exam');
  const sorted = exams.slice().sort((a, b) => firstDate(a) < firstDate(b) ? -1 : firstDate(a) > firstDate(b) ? 1 : 0);
  const before = exams.map(x => x.key).join(','), after = sorted.map(x => x.key).join(',');
  if (before === after) continue;
  let i = 0; while (exams[i].key === sorted[i].key) i++;
  const url = (s.steps.find(x => /^https?:/.test(x.sourceUrl || '')) || {}).sourceUrl || 'https://c-mirai.jp/';
  for (const st of exams.slice(i)) ops.push({ school: s.id, op: 'removeStep', step: st.key, evidence: { url } });
  for (const st of sorted.slice(i)) ops.push({ school: s.id, op: 'addStep', stepObj: st, evidence: { url: /^https?:/.test(st.sourceUrl || '') ? st.sourceUrl : url } });
  report.push(`${s.id}: ${before} -> ${after}`);
}
fs.writeFileSync(out, JSON.stringify(ops, null, 1));
console.log(report.join('\n') || '(already in order)');
console.log('ops', ops.length, '->', out);
