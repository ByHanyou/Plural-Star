#!/usr/bin/env node
const {spawnSync} = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REVIEW_BY = '2027-01-17';
const KNOWN = [
  {id: 'GHSA-vfj7-8cjw-p6xm', name: 'braces'},
];

const die = msg => { console.error(`\n${msg}\n`); process.exit(1); };

const r = spawnSync('npm audit --json', {cwd: ROOT, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024});
if (r.error) die(`Could not run npm audit (${r.error.message}).`);

let report;
try {
  report = JSON.parse(r.stdout);
} catch {
  die('npm audit did not return a readable report.');
}
if (report.error) die(`npm audit failed: ${report.error.summary || report.error.code || 'unknown error'}`);

const found = new Map();
for (const v of Object.values(report.vulnerabilities || {})) {
  for (const via of v.via || []) {
    if (!via || typeof via !== 'object') continue;
    const id = String(via.url || '').split('/').pop();
    const key = `${via.name} ${id}`;
    if (!found.has(key)) found.set(key, {id, name: via.name, severity: via.severity, title: via.title, url: via.url});
  }
}

const isKnown = f => KNOWN.some(k => k.id === f.id && k.name === f.name);
const all = [...found.values()];
const known = all.filter(isKnown);
const fresh = all.filter(f => !isKnown(f));
const gone = KNOWN.filter(k => !all.some(f => f.id === k.id && f.name === k.name));
const line = f => `  ${f.severity}  ${f.name}  ${f.id}  ${f.title}\n    ${f.url}`;

if (fresh.length) {
  console.error('\nNew audit problems found:');
  for (const f of fresh) console.error(line(f));
  die(`${fresh.length} new problem(s). Fix them, or if no fix exists, add them to KNOWN in scripts/audit-check.js.`);
}
if (known.length && Date.now() > new Date(`${REVIEW_BY}T23:59:59`).getTime()) {
  console.error(`\nThe review date (${REVIEW_BY}) has passed. Check whether these now have a fix:`);
  for (const f of known) console.error(line(f));
  die('Fix them, or move REVIEW_BY in scripts/audit-check.js after rechecking.');
}
if (known.length) {
  console.log(`\nNo new audit problems. Ignoring these known problems that have no fix, until ${REVIEW_BY}:`);
  for (const f of known) console.log(line(f));
} else {
  console.log('\nNo audit problems.');
}
if (gone.length) {
  console.log('\nNo longer reported, so they can be removed from KNOWN:');
  for (const k of gone) console.log(`  ${k.name}  ${k.id}`);
}
