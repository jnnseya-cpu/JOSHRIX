#!/usr/bin/env node
/**
 * Build the test workspace and run the suite.
 *
 *   npm test                  everything
 *   npm test -- --filter t6   only tests whose filename contains "t6"
 *   npm test -- --build-only  compile, run nothing
 *
 * Needs `npm install` first. Two files (t22, t25) drive a real browser: if
 * Chromium is not already on the machine, `npx playwright install chromium`
 * once. CHROMIUM_PATH overrides the lookup.
 *
 * WHY A WORKSPACE. The tests exercise the real serverless handlers, which are
 * TypeScript ESM-style modules under api/. Vercel compiles those at deploy time;
 * nothing in the repo compiles them for a local run. So this script mirrors
 * api/ and shared/ into a throwaway tree, compiles it once with tsc, and points
 * the tests at the emitted JavaScript. Without it the suite is only runnable by
 * someone who already knows the ritual — which is how tests/t2b sat permanently
 * red and tests/t6 reported a passing narrative while asserting nothing.
 *
 * Two require() layouts exist in the suite and both must keep working:
 *   ./build/api/_ledger.js    + ./build/shared/payments.js
 *   ./build/_ledger.js        + ../shared/payments.js  (relative to build/)
 * so the compiled output is mirrored flat as well as nested.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WS = path.join(ROOT, '.testbuild');
const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf('--' + name);
  if (i !== -1 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : null;
};
const filter = argOf('filter');
const buildOnly = args.includes('--build-only');

const rm = (p) => fs.rmSync(p, { recursive: true, force: true });
const copyInto = (fromDir, toDir, ext) => {
  fs.mkdirSync(toDir, { recursive: true });
  for (const f of fs.readdirSync(fromDir)) {
    if (ext.some((e) => f.endsWith(e))) fs.copyFileSync(path.join(fromDir, f), path.join(toDir, f));
  }
};

/* ---------- 1. mirror the sources ---------- */
rm(WS);
fs.mkdirSync(WS, { recursive: true });
copyInto(path.join(ROOT, 'api'), path.join(WS, 'src', 'api'), ['.ts']);
copyInto(path.join(ROOT, 'shared'), path.join(WS, 'src', 'shared'), ['.ts']);

fs.writeFileSync(path.join(WS, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'es2022', module: 'commonjs', moduleResolution: 'node',
    // moduleResolution 'node' (node10) is what CommonJS output wants, and newer
    // tsc deprecates the name rather than the behaviour. Silence it explicitly:
    // without this the build prints "1 type error(s)" on every single run, and a
    // permanent expected error is how a real one goes unnoticed.
    // "5.0", not the "6.0" that tsc's own error message suggests — 5.9 rejects
    // that value outright. Verified against the installed compiler, not guessed.
    ignoreDeprecations: '5.0',
    // The handlers are type-checked by Vercel on deploy; here the job is to
    // EMIT runnable JS for the assertions, so a library typing mismatch in a
    // vendored SDK must not stop the money tests from running.
    strict: false, skipLibCheck: true, esModuleInterop: true,
    outDir: 'build', rootDir: 'src',
  },
  include: ['src/**/*.ts'],
}, null, 2));

/* ---------- 2. compile ---------- */
console.log('building…');
const tsc = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '-p', '.'], {
  cwd: WS, encoding: 'utf8',
});
const tscOut = (tsc.stdout || '') + (tsc.stderr || '');
const typeErrors = tscOut.split('\n').filter((l) => /error TS/.test(l));
if (typeErrors.length) {
  console.log(`\n  ${typeErrors.length} type error(s):`);
  typeErrors.slice(0, 20).forEach((l) => console.log('   ' + l));
}
if (!fs.existsSync(path.join(WS, 'build', 'api'))) {
  console.error('\nBUILD FAILED — nothing was emitted.\n' + tscOut.slice(0, 4000));
  process.exit(1);
}

/* ---------- 3. mirror the emitted JS into both layouts ---------- */
copyInto(path.join(WS, 'build', 'api'), path.join(WS, 'build'), ['.js']);
copyInto(path.join(WS, 'build', 'shared'), path.join(WS, 'shared'), ['.js']);
copyInto(path.join(ROOT, 'tests'), WS, ['.js', '.mjs']);
if (buildOnly) { console.log('built: ' + WS); process.exit(typeErrors.length ? 1 : 0); }

/* ---------- 4. run ---------- */
const files = fs.readdirSync(WS)
  .filter((f) => /^t\d/.test(f) && (f.endsWith('.js') || f.endsWith('.mjs')))
  .filter((f) => !filter || f.includes(filter))
  .sort((a, b) => (parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10)) || a.localeCompare(b));

if (!files.length) { console.error(`no tests matched --filter ${filter}`); process.exit(1); }

// t17 re-exports GLB through three's exporter, which needs browser globals.
const EXTRA_NODE_ARGS = { 't17-characters.mjs': ['--import', path.join(ROOT, 'tools', 'gltf-export-polyfill.mjs')] };

let failed = 0, totalPass = 0, totalFail = 0;
console.log('');
for (const f of files) {
  const r = spawnSync(process.execPath, [...(EXTRA_NODE_ARGS[f] || []), f], {
    cwd: WS, encoding: 'utf8', env: { ...process.env, JOSHRIX_ROOT: ROOT },
    maxBuffer: 32 * 1024 * 1024,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = [...out.matchAll(/(\d+) passed, (\d+) failed/g)].pop();
  if (m) { totalPass += Number(m[1]); totalFail += Number(m[2]); }
  // A file that PRINTS failures but exits 0 is still a failure. t3-security did
  // exactly that for weeks, so its one real finding read as green in every run.
  const ok = r.status === 0 && !(m && Number(m[2]) > 0);
  if (!ok) failed++;
  const summary = m ? `${m[1]} passed, ${m[2]} failed` : (ok ? 'ok' : 'FAILED');
  console.log(`  ${(ok ? 'PASS' : 'FAIL').padEnd(5)} ${f.padEnd(28)} ${summary}`);
  if (!ok) out.trim().split('\n').filter((l) => /FAIL|Error|error/.test(l)).slice(0, 6)
    .forEach((l) => console.log('          ' + l.trim().slice(0, 160)));
}

console.log(`\n  ${files.length} files · ${totalPass} assertions passed, ${totalFail} failed · ${failed} file(s) failing`);
process.exit(failed ? 1 : 0);
