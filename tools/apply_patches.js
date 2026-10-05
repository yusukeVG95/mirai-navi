#!/usr/bin/env node
// Apply patch files (JSON) to index.html. Usage: node apply_patches.js [--dry] patch1.json [patch2.json ...]
//
// Patch file = JSON array of operations:
//   { "school":"<id>", "op":"setStep",    "step":"<step key>", "set":{ "examDate":"2027-03-03", "note":null, ... }, "evidence":{ "url":"https://..." } }
//   { "school":"<id>", "op":"addStep",    "stepObj":{ "type":"exam","key":"niji","label":"二次募集","examDate":"2027-03-23", ... }, "evidence":{ "url":"..." } }
//   { "school":"<id>", "op":"removeStep", "step":"<step key>", "evidence":{ "url":"..." } }
//   { "school":"<id>", "op":"setField",   "set":{ "quota":"..." } }
//   { "school":"<id>", "op":"setEvents",  "events":[ {date,label,time,format,applyUrl,applyDeadline,note} ], "eventsSource":{ "url":"...","where":"..." } }
// A null value in "set" deletes that field.  "evidence.url" is mandatory for any change to a date / cycle / note of a step.
const fs = require('fs'), vm = require('vm');
const L = require('./lib.js');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const files = args.filter(a => !a.startsWith('--'));
if(!files.length){ console.error('no patch files'); process.exit(1); }

let html = L.readHtml();
const { consts } = L.loadData(html);
const rev = L.constReverse(consts);
const log = [], problems = [];

const DATE_FIELDS = ['applyStart','applyEnd','examDate','resultDate'];
const ISO = /\d{4}-\d{2}-\d{2}/;
function validateStep(id, step){
  for(const f of DATE_FIELDS) if(step[f] != null && !ISO.test(String(step[f]))) problems.push(`${id}/${step.key}: ${f} not ISO-parsable: ${step[f]}`);
  if(step.cycle != null && !/^R\d+(ref)?$/.test(step.cycle)) problems.push(`${id}/${step.key}: bad cycle ${step.cycle}`);
  if(!step.type || !step.key || !step.label) problems.push(`${id}: step needs type/key/label`);
}
function needEvidence(op, what){
  if(!op.evidence || !/^https?:\/\//.test(op.evidence.url || '')) problems.push(`${op.school}: ${what} without evidence.url`);
}

// step helpers inside the school's text
function stepsRange(block){
  const i = block.indexOf('steps:[');
  if(i < 0) throw new Error('no steps');
  const open = block.indexOf('[', i);
  return [open, L.findMatching(block, open, '[', ']')];
}
function stepObjects(block){
  const [o, c] = stepsRange(block);
  const out = [];
  let i = o + 1;
  while(i < c){
    const b = block.indexOf('{', i);
    if(b < 0 || b > c) break;
    const e = L.findMatching(block, b, '{', '}');
    out.push({ start: b, end: e + 1, text: block.slice(b, e + 1) });
    i = e + 1;
  }
  return out;
}
function evalObj(text){ return vm.runInNewContext('(' + text + ')', Object.assign({}, consts)); }

function applyOne(op){
  const [s, e] = L.schoolRange(html, op.school);
  let block = html.slice(s, e);
  const replaceBlock = nb => { html = html.slice(0, s) + nb + html.slice(e); };

  if(op.op === 'setStep' || op.op === 'removeStep'){
    const objs = stepObjects(block);
    const hit = objs.find(o => new RegExp('key:"' + op.step + '"').test(o.text));
    if(!hit){ problems.push(`${op.school}: step key "${op.step}" not found`); return; }
    if(op.op === 'removeStep'){
      needEvidence(op, 'removeStep');
      // remove object + its trailing comma/newline
      let a = hit.start, b = hit.end;
      while(/\s/.test(block[a-1])) a--;           // eat leading whitespace
      if(block[b] === ',') b++;
      replaceBlock(block.slice(0, a) + block.slice(b));
      log.push(`${op.school} removeStep ${op.step}`);
      return;
    }
    const step = evalObj(hit.text);
    const before = JSON.parse(JSON.stringify(step));
    for(const [k, v] of Object.entries(op.set || {})){
      if(v === null) delete step[k]; else step[k] = v;
    }
    const touched = Object.keys(op.set || {}).filter(k => DATE_FIELDS.includes(k) || k === 'cycle' || k === 'note');
    if(touched.length) needEvidence(op, 'setStep ' + touched.join(','));
    validateStep(op.school, step);
    // keep original indentation of the step's first line
    const lineStart = block.lastIndexOf('\n', hit.start) + 1;
    const indent = block.slice(lineStart, hit.start);
    const nt = L.stepToJs(step, rev, indent).replace(/^\s+/, '');
    replaceBlock(block.slice(0, hit.start) + nt + block.slice(hit.end));
    const diffs = Object.keys(Object.assign({}, before, step)).filter(k => JSON.stringify(before[k]) !== JSON.stringify(step[k]))
      .map(k => `${k}: ${JSON.stringify(before[k])} -> ${JSON.stringify(step[k])}`);
    log.push(`${op.school} step:${op.step}\n    ` + diffs.join('\n    '));
    return;
  }

  if(op.op === 'addStep'){
    needEvidence(op, 'addStep');
    validateStep(op.school, op.stepObj);
    const [o, c] = stepsRange(block);
    const objs = stepObjects(block);
    if(objs.some(x => new RegExp('key:"' + op.stepObj.key + '"').test(x.text))){ problems.push(`${op.school}: step ${op.stepObj.key} already exists`); return; }
    const last = objs[objs.length - 1];
    const ins = ',\n' + L.stepToJs(op.stepObj, rev);
    replaceBlock(block.slice(0, last.end) + ins + block.slice(last.end));
    log.push(`${op.school} addStep ${op.stepObj.key} (${op.stepObj.label})`);
    return;
  }

  if(op.op === 'setField'){
    for(const [k, v] of Object.entries(op.set || {})){
      const re = new RegExp('(\\n    ' + k + ':)("(?:[^"\\\\]|\\\\.)*")|(, ' + k + ':)("(?:[^"\\\\]|\\\\.)*")');
      const m = block.match(re);
      if(!m){ problems.push(`${op.school}: field ${k} not found (setField supports existing string fields only)`); continue; }
      block = block.replace(re, (all, p1, v1, p2, v2) => (p1 || p2) + JSON.stringify(v));
      log.push(`${op.school} ${k} -> ${JSON.stringify(v)}`);
    }
    replaceBlock(block);
    return;
  }

  if(op.op === 'setEvents'){
    const i = block.indexOf('events:[');
    if(i < 0){ problems.push(`${op.school}: events array not found`); return; }
    const open = block.indexOf('[', i);
    const close = L.findMatching(block, open, '[', ']');
    const body = op.events.length ? '\n' + op.events.map(ev => L.eventToJs(ev, rev)).join(',\n') + '\n    ' : '';
    block = block.slice(0, open + 1) + body + block.slice(close);
    if(op.eventsSource){
      const j = block.indexOf('eventsSource:{');
      if(j >= 0){
        const o2 = block.indexOf('{', j);
        const c2 = L.findMatching(block, o2, '{', '}');
        block = block.slice(0, j) + 'eventsSource:' + L.jsVal(op.eventsSource, rev) + block.slice(c2 + 1);
      }
    }
    replaceBlock(block);
    log.push(`${op.school} events: ${op.events.length} item(s)`);
    return;
  }
  problems.push(`${op.school}: unknown op ${op.op}`);
}

for(const f of files){
  const ops = JSON.parse(fs.readFileSync(f, 'utf8'));
  for(const op of ops){
    try { applyOne(op); } catch(err){ problems.push(`${op.school} ${op.op}: ${err.message}`); }
  }
}

// post-validation: file still evaluates, ids unique
try {
  const d = L.loadData(html);
  const ids = d.SCHOOLS.map(s => s.id);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if(dup.length) problems.push('duplicate ids: ' + dup.join(','));
  console.log('schools after patch:', d.SCHOOLS.length);
} catch(err){ problems.push('FATAL data block no longer evaluates: ' + err.message); }

console.log(log.join('\n'));
if(problems.length){ console.log('\nPROBLEMS:\n' + problems.join('\n')); }
if(problems.some(p => p.startsWith('FATAL'))){ console.log('NOT written.'); process.exit(2); }
if(dry){ console.log('\n(dry run, nothing written)'); }
else { fs.writeFileSync(L.HTML, html); console.log('\nwritten', L.HTML); }
process.exit(problems.length ? 1 : 0);
