// Run this in the browser console / javascript_tool while on https://c-mirai.jp/events
// (c-mirai.jp rejects non-browser clients with HTTP 429, so scraping must happen inside a real browser tab).
// It reads every page of the event list, de-duplicates, and returns a JSON string in window.__payload.
// Then save it locally with tools/recv.js (see README):  location.href = 'http://localhost:8799/save?name=events_full.json&d=' + encodeURIComponent(window.__payload)
(async () => {
  async function grab(page){
    const r = await fetch(`/events/?page=${page}`, {credentials:'same-origin'});
    if(!r.ok) return [];
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const cards = Array.from(doc.querySelectorAll('a[href^="/events/"]')).filter(a=>a.querySelector('h2'));
    return cards.map(a=>{
      const tx = Array.from(a.querySelectorAll('time')).map(t=>t.textContent.trim());
      const yt = tx.filter(x=>/^〜?\d{4}年$/.test(x)), dtx = tx.filter(x=>/\d{2}月\d{2}日/.test(x));
      const pm = s => { const m = (s||'').match(/(\d{2})月(\d{2})日\([^)]*\)\s*([\d:\-〜～]*)/); return m ? {m:m[1], d:m[2], t:m[3]} : null; };
      const p1 = pm(dtx[0]), p2 = pm(dtx[1]);
      const y1 = (yt[0]||'').replace(/\D/g,''), y2 = (yt[1]||'').replace(/\D/g,'') || y1;
      const dls = {}; a.querySelectorAll('dl').forEach(dl=>{ const k=(dl.querySelector('dt')||{}).textContent; const v=(dl.querySelector('dd')||{}).textContent; if(k) dls[k.trim()]=(v||'').replace(/\s+/g,' ').trim(); });
      const tags = [...new Set(Array.from(a.querySelectorAll('li,span')).map(e=>e.textContent.trim()).filter(t=>t.startsWith('#')))];
      return { id:a.getAttribute('href').replace('/events/',''), d1: p1?`${y1}-${p1.m}-${p1.d}`:'', d2: p2?`${y2}-${p2.m}-${p2.d}`:'', time:(p1&&p1.t)||'', title:a.querySelector('h2').textContent.replace(/\s+/g,' ').trim(), school:(dls['出演']||''), place:(dls['開催場所']||'').slice(0,40), tags: tags.slice(0,14) };
    });
  }
  const all = []; let p = 0;
  for(; p<40; p++){ const items = await grab(p); if(!items.length) break; all.push(...items); await new Promise(r=>setTimeout(r,350)); }
  const seen = new Set(); const uniq = all.filter(e=>!seen.has(e.id) && seen.add(e.id));
  window.__payload = JSON.stringify({fetchedAt:new Date().toISOString(), pages:p, events:uniq});
  console.log('pages', p, 'events', uniq.length);
})();
