#!/usr/bin/env node
// Build "setEvents" patch operations from the scraped c-mirai.jp event list.
// Usage: node refresh_events.js <events_full.json> <out_patch.json> [--today=YYYY-MM-DD]
const fs = require('fs');
const L = require('./lib.js');

const [evFile, outFile] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const todayArg = (process.argv.find(a => a.startsWith('--today=')) || '').slice(8);
const today = todayArg || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const MAX_PER_SCHOOL = 15;

const raw = JSON.parse(fs.readFileSync(evFile, 'utf8'));
const { SCHOOLS } = L.loadData();

const PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
const norm = s => String(s || '').replace(/[\s　（）()・･]/g, '').replace(/県立/g,'県').replace(/府立/g,'府').replace(/都立/g,'都').replace(/道立|市立|町立|高等学校|高校/g, '');
const prefOf = n => PREFS.find(p => String(n).startsWith(p)) || null;

// manual aliases for branch campuses / differently written names (all tokens must appear)
const ALIAS = {
  okayama_katsuyama_hiruzen: ['蒜山'], hiroshima_geihoku: ['芸北'], shizuoka_toi: ['土肥'], shizuoka_sakuma: ['佐久間'],
  kochi_nakamura_nishitosa: ['西土佐'], ehime_ouchi_oda: ['小田分校'], ehime_tobe: ['砥部'], tokushima_kamiyama: ['神山'],
  yamagata_kaneyama: ['金山'], oita_nakatsuminami_yaba: ['耶馬溪'], kumamoto_takushin_marine: ['天草拓心'],
  nagano_komorogijuku: ['小諸義塾'], ehime_uwajimaminami: ['宇和島'], nara_nishiyoshino: ['西吉野'],
};

const matchers = SCHOOLS.map(s => ({ id: s.id, pref: s.pref, full: norm(s.name), alias: ALIAS[s.id] || null }));

function schoolsIn(S){
  const n = norm(S);
  const hits = new Set();
  for(const m of matchers){
    if(m.alias){ if(n.includes(m.pref) && m.alias.every(t => n.includes(t))) hits.add(m.id); continue; }
    let from = 0, idx;
    while((idx = n.indexOf(m.full, from)) >= 0){
      const after = n.slice(idx + m.full.length);
      if(after === '' || PREFS.some(p => after.startsWith(p)) || /^(音楽科|分校|校地|校舎)/.test(after)){ hits.add(m.id); break; }
      from = idx + 1;
    }
  }
  return [...hits];
}

const clean = t => String(t).replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/[☆★▼▽△▲◆◇■□●○◎＼／\\]/g, ' ').replace(/\s+/g, ' ').trim();
const cut = (t, n) => t.length > n ? t.slice(0, n - 1) + '…' : t;

const bySchool = new Map(), unmatched = new Map();
for(const e of raw.events){
  const ids = schoolsIn(e.school);
  if(!ids.length){ unmatched.set(e.school, (unmatched.get(e.school) || 0) + 1); continue; }
  for(const id of ids){ if(!bySchool.has(id)) bySchool.set(id, []); bySchool.get(id).push(e); }
}

const endOf = d => (d || '').split('〜').pop().slice(0, 10);
const startOf = d => (d || '').slice(0, 10);
const ops = [];
const stat = { schoolsWithEvents: 0, total: 0, droppedPast: 0 };

for(const s of SCHOOLS){
  const cm = (bySchool.get(s.id) || []);
  const fresh = cm.map(e => {
    const allDay = e.time === '00:00-23:59';
    const range = e.d2 && e.d2 !== e.d1;
    const ev = {
      date: range ? `${e.d1}〜${e.d2}` : e.d1,
      label: cut(clean(e.title), 60),
      time: allDay || range ? undefined : (e.time || undefined),
      format: /オンライン/.test(e.place) ? 'オンライン' : '現地',
      applyUrl: 'https://c-mirai.jp/events/' + e.id,
    };
    if(allDay || range) ev.note = range ? '期間内に随時・複数日開催' : '終日・随時受付';
    return ev;
  }).filter(ev => endOf(ev.date) >= today);

  // existing events: keep future ones that are not duplicated by a fresh event on the same start date
  const freshStarts = new Set(fresh.map(ev => startOf(ev.date)));
  const old = (s.events || []);
  const keepOld = old.filter(ev => {
    if(!ev.date) return fresh.length === 0;                 // undated placeholder: keep only if nothing better
    if(ev.past) return false;
    if(endOf(ev.date) < today){ stat.droppedPast++; return false; }
    return !freshStarts.has(startOf(ev.date));
  });
  const merged = [...fresh, ...keepOld].sort((a, b) => {
    const ea = a.date ? (startOf(a.date) < today ? today : startOf(a.date)) : '9999';
    const eb = b.date ? (startOf(b.date) < today ? today : startOf(b.date)) : '9999';
    return ea.localeCompare(eb);
  }).slice(0, MAX_PER_SCHOOL);

  const same = JSON.stringify(merged) === JSON.stringify(old);
  if(same) continue;
  if(merged.length) stat.schoolsWithEvents++;
  stat.total += merged.length;
  const op = { school: s.id, op: 'setEvents', events: merged };
  if(fresh.length && s.eventsSource) op.eventsSource = { url: s.eventsSource.url, where: `c-mirai.jp イベント一覧（${today}時点で更新）。申込はイベントページから。` };
  ops.push(op);
}

fs.writeFileSync(outFile, JSON.stringify(ops, null, 1));
console.log(`today=${today} events scraped=${raw.events.length}`);
console.log(`matched to ${bySchool.size} schools; ops=${ops.length}; events written=${stat.total}; past dropped=${stat.droppedPast}`);
console.log('UNMATCHED 出演 (maybe new schools / organizers):');
for(const [k, v] of [...unmatched.entries()].sort((a, b) => b[1] - a[1])) console.log('  ', v, k.slice(0, 90));
