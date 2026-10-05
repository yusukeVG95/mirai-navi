#!/usr/bin/env node
// Print the current data of schools compactly. Usage: node dump_school.js <prefecture or school id> [...]
//   e.g.  node dump_school.js 山形県      node dump_school.js yamagata_oguni kochi_muroto
const L = require('./lib.js');
const { SCHOOLS } = L.loadData();
const keys = process.argv.slice(2);
if(!keys.length){ console.error('give a prefecture name or school ids'); process.exit(1); }
const pick = SCHOOLS.filter(s => keys.includes(s.pref) || keys.includes(s.id));
for(const s of pick){
  console.log(`\n## ${s.id} | ${s.name} | ${s.pref} | ${s.quota}`);
  for(const st of s.steps || []){
    const f = ['applyStart','applyEnd','examDate','resultDate'].map(k => st[k] ? `${k}=${st[k]}` : null).filter(Boolean).join(' ');
    console.log(`  - [${st.type}] key=${st.key} label=${st.label} cycle=${st.cycle ?? '-'}${st.exclusive ? ' EXCLUSIVE' : ''} ${f}`);
    if(st.note) console.log(`      note: ${st.note.slice(0, 110)}${st.note.length > 110 ? '…' : ''}`);
  }
}
console.log(`\n(${pick.length} schools)`);
