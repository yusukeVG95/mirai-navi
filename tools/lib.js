// mirai-navi data tooling: load / inspect / patch the SCHOOLS data embedded in index.html
const fs = require('fs'), vm = require('vm'), path = require('path');
const HTML = path.join(__dirname, '..', 'index.html');

function readHtml(){ return fs.readFileSync(HTML, 'utf8'); }

// Evaluate the data block (PREFS ... SCHOOLS) and return {SCHOOLS, consts}
function loadData(html = readHtml()){
  const start = html.indexOf('const PREFS');
  const end = html.indexOf('const RESIDENCE_NOTES');
  const code = html.slice(start, end);
  const names = [...code.matchAll(/^const ([A-Z_0-9]+)\s*=/gm)].map(m=>m[1]);
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(code + '\n;this.__out = {SCHOOLS, consts:{' + names.filter(n=>n!=='SCHOOLS').map(n=>`${n}:typeof ${n}!=="undefined"?${n}:undefined`).join(',') + '}};', sandbox);
  return sandbox.__out;
}

// ---- text-level helpers (edit only what changes; keep the file readable) ----
function findMatching(text, openIdx, open, close){
  let depth = 0, inStr = false, q = '';
  for(let i = openIdx; i < text.length; i++){
    const c = text[i];
    if(inStr){ if(c === '\\') { i++; continue; } if(c === q) inStr = false; continue; }
    if(c === '"' || c === "'" || c === '`'){ inStr = true; q = c; continue; }
    if(c === open) depth++;
    else if(c === close){ depth--; if(depth === 0) return i; }
  }
  throw new Error('unbalanced');
}

// locate school block [start,end) in html by id
function schoolRange(html, id){
  const m = html.indexOf(`id:"${id}"`);
  if(m < 0) throw new Error('school not found: ' + id);
  const start = html.lastIndexOf('\n  {', m) + 1;       // start of the "  {" line
  const braceIdx = html.indexOf('{', start);
  const end = findMatching(html, braceIdx, '{', '}') + 1;
  return [start, end];
}

function constReverse(consts){
  const rev = new Map();
  for(const [k,v] of Object.entries(consts)) if(typeof v === 'string' && v.length > 8) rev.set(v, k);
  return rev;
}
function jsVal(v, rev){
  if(v === null) return 'null';
  if(typeof v === 'boolean' || typeof v === 'number') return String(v);
  if(typeof v === 'string') return rev && rev.has(v) ? rev.get(v) : JSON.stringify(v);
  if(Array.isArray(v)) return '[' + v.map(x=>jsVal(x, rev)).join(',') + ']';
  if(typeof v === 'object') return '{ ' + Object.entries(v).map(([k,x])=>`${k}:${jsVal(x, rev)}`).join(', ') + ' }';
  return 'null';
}
const LINE1 = ['type','key','label','applyStart','applyEnd','examDate','resultDate','exclusive','cycle','yearLabel'];
function stepToJs(step, rev, indent = '      '){
  const keys = Object.keys(step);
  const a = keys.filter(k=>LINE1.includes(k) && step[k] !== undefined);
  const b = keys.filter(k=>!LINE1.includes(k) && step[k] !== undefined);
  const l1 = a.map(k=>`${k}:${jsVal(step[k], rev)}`).join(', ');
  const l2 = b.map(k=>`${k}:${jsVal(step[k], rev)}`).join(', ');
  return `${indent}{ ${l1}${l2 ? ',\n' + indent + '  ' + l2 : ''} }`;
}
function eventToJs(ev, rev){
  return '      { ' + Object.entries(ev).filter(([,v])=>v !== undefined).map(([k,v])=>`${k}:${jsVal(v, rev)}`).join(', ') + ' }';
}

module.exports = { HTML, readHtml, loadData, findMatching, schoolRange, constReverse, jsVal, stepToJs, eventToJs };
