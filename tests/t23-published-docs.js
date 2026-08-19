/**
 * THE PUBLISHED SPECS ARE A SECOND COPY.
 *
 * /docs on the live site renders markdown from frontend/specs/, because
 * outputDirectory is "frontend" and docs/ is never deployed. So thirteen
 * documents exist twice in this repository, byte for byte. Nothing enforces
 * that, which means the day someone edits docs/MONETISATION.md the public
 * version silently keeps quoting the old commission ladder — and no one finds
 * out, because a stale document throws no error.
 *
 * This file is the enforcement. It also checks the two ways the docs page can
 * break without anyone noticing: a link to a document that is not deployed, and
 * a deployed document nothing links to.
 *
 *   node tests/t23-published-docs.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.JOSHRIX_ROOT || process.cwd();
const SPECS = path.join(ROOT, 'frontend', 'specs');
const DOCS = path.join(ROOT, 'docs');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const published = fs.readdirSync(SPECS).filter((f) => f.endsWith('.md')).sort();

console.log('\n== every published spec still matches its source in docs/ ==');
t('there are published specs at all', published.length > 0);
for (const f of published) {
  const src = path.join(DOCS, f);
  if (!fs.existsSync(src)) { t(`${f} has a source in docs/`, false, 'published with no original — which one is true?'); continue; }
  t(`${f} matches docs/${f}`,
    fs.readFileSync(path.join(SPECS, f), 'utf8') === fs.readFileSync(src, 'utf8'),
    'the public copy has drifted from the working copy — re-copy it');
}

console.log('\n== the docs page cannot link to a document that is not there ==');
const docPage = fs.readFileSync(path.join(ROOT, 'frontend', 'doc.html'), 'utf8');
const indexPage = fs.readFileSync(path.join(ROOT, 'frontend', 'docs.html'), 'utf8');

// doc.html carries an allowlist; anything outside it silently falls back to INDEX
const allowedBlock = /ALLOWED\s*=\s*\[([^\]]*)\]/.exec(docPage);
t('doc.html has an allowlist', !!allowedBlock,
  'without one, ?d= builds a fetch path from user input');
const allowed = allowedBlock ? [...allowedBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];

for (const name of allowed) {
  t(`allowlisted ${name} is deployed`, published.includes(name + '.md'),
    'the page would show "Could not load this document"');
}

const linked = [...indexPage.matchAll(/doc\.html\?d=([A-Z0-9-]+)/g)].map((m) => m[1]);
for (const name of new Set(linked)) {
  t(`linked ${name} is allowlisted`, allowed.includes(name),
    'the allowlist would bounce this link to INDEX instead');
}

console.log('\n== nothing is deployed that nobody can reach ==');
for (const f of published) {
  const name = f.replace(/\.md$/, '');
  t(`${name} is reachable from /docs`, allowed.includes(name),
    'a document published but unlinked is either a leak or dead weight');
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
