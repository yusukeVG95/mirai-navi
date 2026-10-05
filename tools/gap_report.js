// Report which schools/steps still rely on reference-year (R8ref etc.) or missing dates, grouped by prefecture.
const L = require('./lib.js');
const { SCHOOLS } = L.loadData();
const byPref = {};
for(const s of SCHOOLS){
  const gaps = [];
  for(const st of (s.steps||[])){
    if(st.type !== 'exam') continue;
    const missing = ['examDate','resultDate'].filter(f => !st[f]);
    const ref = st.cycle && /ref/i.test(st.cycle);
    const noApply = !st.applyEnd;
    if(ref) gaps.push(`${st.key}:${st.cycle}`);
    else if(missing.length) gaps.push(`${st.key}:no-${missing.join('/')}`);
    else if(noApply && st.exclusive !== undefined) gaps.push(`${st.key}:no-applyEnd`);
  }
  if(gaps.length){ (byPref[s.pref] ||= []).push(`${s.id} [${gaps.join(', ')}]`); }
}
const prefs = Object.keys(byPref).sort((a,b)=>byPref[b].length-byPref[a].length);
let total = 0;
for(const p of prefs){ total += byPref[p].length; console.log(`${p} (${byPref[p].length}校)`); }
console.log('schools with gaps:', total, 'of', SCHOOLS.length);
if(process.argv[2]) for(const p of process.argv.slice(2)) console.log('\n'+p+'\n  '+(byPref[p]||[]).join('\n  '));
