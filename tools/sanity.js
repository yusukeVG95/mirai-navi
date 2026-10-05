#!/usr/bin/env node
// Sanity checks on the data: date plausibility and ordering. Usage: node sanity.js
const L = require('./lib.js');
const { SCHOOLS } = L.loadData();
const ISO = /\d{4}-\d{2}-\d{2}/g;
const first = s => { const m = String(s || '').match(ISO); return m ? m[0] : null; };
// end of a range; understands the abbreviated form "2027-03-24〜26" (= 2027-03-26)
const last = s => {
  const t = String(s || '');
  const sh = t.match(/(\d{4})-(\d{2})-(\d{2})〜(\d{1,2})(?![\d-])/);
  if(sh) return sh[1] + '-' + sh[2] + '-' + sh[4].padStart(2, '0');
  const m = t.match(ISO);
  return m ? m[m.length - 1] : null;
};
const problems = [];
const ids = new Set();
for(const s of SCHOOLS){
  if(ids.has(s.id)) problems.push(`dup id ${s.id}`); ids.add(s.id);
  const keys = new Set();
  for(const st of s.steps || []){
    if(keys.has(st.key)) problems.push(`${s.id}: duplicate step key ${st.key}`); keys.add(st.key);
    if(st.type !== 'exam' || /ref/i.test(st.cycle || '')) continue;
    const a1 = first(st.applyStart), a2 = last(st.applyEnd), e1 = first(st.examDate), e2 = last(st.examDate), r = first(st.resultDate);
    const tag = `${s.id}/${st.key}`;
    for(const [n, d] of [['applyStart', a1], ['applyEnd', a2], ['examDate', e1], ['resultDate', r]]){
      if(d && (d < '2026-10-01' || d > '2027-05-01')) problems.push(`${tag}: ${n} out of R9 range: ${d}`);
    }
    if(a1 && a2 && a1 > a2) problems.push(`${tag}: applyStart ${a1} > applyEnd ${a2}`);
    if(a2 && e2 && a2 > e2) problems.push(`${tag}: applyEnd ${a2} > examDate end ${e2}`);
    if(e2 && r && e2 > r) problems.push(`${tag}: examDate ${e2} > resultDate ${r}`);
    if(a2 && r && a2 > r) problems.push(`${tag}: applyEnd ${a2} > resultDate ${r}`);
  }
  for(const ev of s.events || []){
    const d = first(ev.date);
    if(ev.date && !d) problems.push(`${s.id}: event date not parsable: ${ev.date}`);
  }
}
console.log(`schools=${SCHOOLS.length}, problems=${problems.length}`);
problems.forEach(p => console.log('  ' + p));
process.exit(problems.length ? 1 : 0);
