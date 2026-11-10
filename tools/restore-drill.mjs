/**
 * PROVE THE BACKUP, BY RESTORING IT.
 *
 *   node tools/restore-drill.mjs --source "$DATABASE_URL" --into "<empty db url>"
 *
 * `launch-audit/human-actions.md` item 4 has said "snapshots have never been
 * restored — an unrestored backup is not a backup" for weeks, with no way to
 * clear it that did not involve somebody inventing a procedure on the night it
 * mattered. This is that procedure, as one command, and it MEASURES the restore
 * rather than asserting it.
 *
 * WHAT IT DOES
 *   1. `pg_dump -Fc` the source, to a file, timed.
 *   2. `pg_restore` into the target, timed.
 *   3. Compare EVERY table's row count, source against restored.
 *   4. Re-check the double-entry invariant on the restored copy: every
 *      ledger_tx must have postings summing to exactly zero. A restore that
 *      brings back rows but breaks that has not restored the ledger, it has
 *      restored a pile of numbers.
 *   5. Print the measured RTO, which is the figure the runbook needs.
 *
 * WHY IT REFUSES THINGS
 *   A restore tool points a firehose at a database. So: the target must be
 *   named explicitly, it may not be the source, and it must contain no tables
 *   unless --force-overwrite is passed. There is no default target and no way
 *   to run this with one argument. Rule 59 of CLAUDE.md is the reason.
 *
 * WHAT IT NEEDS: `pg_dump`, `pg_restore` and `psql` on PATH, or at
 * /usr/lib/postgresql/<major>/bin. No Node database driver, deliberately — the
 * official client tools are what a recovery would actually use, and adding a
 * driver to run a drill would mean testing something other than the real
 * recovery path.
 *
 * It never touches the source except to read it.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/* ---------------------------------------------------------------- tooling -- */

/** Locate a client binary: PATH first, then the usual packaged location. */
function tool(name) {
  try {
    const found = execFileSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).trim();
    if (found) return found;
  } catch { /* fall through to the packaged path */ }
  const base = "/usr/lib/postgresql";
  try {
    const majors = fs.readdirSync(base).filter((d) => /^\d+$/.test(d)).sort((a, b) => Number(b) - Number(a));
    for (const m of majors) {
      const p = path.join(base, m, "bin", name);
      if (fs.existsSync(p)) return p;
    }
  } catch { /* nothing packaged either */ }
  return null;
}

function die(msg) {
  console.error(`\nrestore-drill: ${msg}\n`);
  process.exit(1);
}

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}

/** Run psql for one scalar/table answer. Never interpolates caller input into
 *  SQL: every query here is a fixed string. */
function query(url, sql) {
  const psql = tool("psql");
  return execFileSync(psql, ["-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-d", url, "-c", sql], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

/** Every user table and its exact row count. count(*) rather than the planner's
 *  estimate, because a drill that accepts an estimate proves nothing. */
function tableCounts(url) {
  const names = query(url, `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
  const tables = names ? names.split("\n").filter(Boolean) : [];
  if (!tables.length) return {};
  /* One round trip for all of them. Identifiers come from the catalogue, not
     from a caller, and are quoted anyway. */
  const union = tables
    .map((t) => `SELECT '${t}' AS t, count(*)::bigint AS n FROM "${t}"`)
    .join(" UNION ALL ");
  const out = {};
  for (const line of query(url, union).split("\n").filter(Boolean)) {
    const [t, n] = line.split("\t");
    out[t] = Number(n);
  }
  return out;
}

/** The double-entry invariant, on whichever copy it is asked about. Returns the
 *  transactions that do NOT balance, which should always be none. */
function unbalancedTx(url) {
  const has = query(url, `SELECT count(*) FROM information_schema.tables
     WHERE table_schema='public' AND table_name='ledger_postings'`);
  if (Number(has) === 0) return { applicable: false, rows: [] };
  const out = query(url, `SELECT tx_id, sum(delta_minor)::bigint FROM ledger_postings
     GROUP BY tx_id HAVING sum(delta_minor) <> 0 ORDER BY tx_id LIMIT 20`);
  return { applicable: true, rows: out ? out.split("\n").filter(Boolean) : [] };
}

/* ------------------------------------------------------------------- main -- */

const source = arg("--source") || process.env.DATABASE_URL;
const into = arg("--into");
const force = process.argv.includes("--force-overwrite");
const keep = process.argv.includes("--keep-dump");

if (process.argv.includes("--help") || !source || !into) {
  console.log(`
  node tools/restore-drill.mjs --source <url> --into <url> [--force-overwrite] [--keep-dump]

    --source           the database to dump. Defaults to $DATABASE_URL. Read only.
    --into             the database to restore INTO. Required, and must be empty
                       unless --force-overwrite is given. Everything in it is at risk.
    --force-overwrite  allow a target that already has tables.
    --keep-dump        leave the dump file on disk and print its path.

  For Neon: create a branch, take its connection string, and pass it as --into.
  The branch is throwaway; the drill tells you how long a real recovery takes.
`);
  process.exit(source && into ? 0 : 1);
}

for (const bin of ["pg_dump", "pg_restore", "psql"]) {
  if (!tool(bin)) die(`${bin} not found on PATH or under /usr/lib/postgresql/*/bin. Install the PostgreSQL client tools.`);
}

if (source.trim() === into.trim()) die("--into is the same database as --source. A drill that restores over the original is not a drill.");

let targetCounts;
try {
  targetCounts = tableCounts(into);
} catch (e) {
  die(`could not reach --into: ${String(e.message ?? e).split("\n")[0]}`);
}
const targetTables = Object.keys(targetCounts).length;
if (targetTables && !force) {
  die(`--into already has ${targetTables} table(s). Point this at an empty database or a throwaway branch, or pass --force-overwrite if you are certain.`);
}

const dumpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "restore-drill-")), "source.dump");

console.log("\n== RESTORE DRILL ==");
console.log(`  source : ${source.replace(/\/\/[^@]*@/, "//<redacted>@")}`);
console.log(`  target : ${into.replace(/\/\/[^@]*@/, "//<redacted>@")}`);

let before;
try {
  before = tableCounts(source);
} catch (e) {
  die(`could not reach --source: ${String(e.message ?? e).split("\n")[0]}`);
}
const sourceRows = Object.values(before).reduce((a, b) => a + b, 0);
console.log(`\n  source holds ${Object.keys(before).length} table(s), ${sourceRows.toLocaleString()} row(s)`);

/* ---- 1. dump ------------------------------------------------------------- */
const t0 = Date.now();
try {
  execFileSync(tool("pg_dump"), ["-Fc", "--no-owner", "--no-privileges", "-f", dumpFile, "-d", source], { stdio: ["ignore", "inherit", "inherit"] });
} catch (e) {
  die(`pg_dump failed: ${String(e.message ?? e).split("\n")[0]}`);
}
const dumpMs = Date.now() - t0;
const dumpBytes = fs.statSync(dumpFile).size;
console.log(`  dump    : ${(dumpBytes / 1024).toFixed(1)} KiB in ${(dumpMs / 1000).toFixed(1)}s`);

/* ---- 2. restore ---------------------------------------------------------- */
const t1 = Date.now();
let restoreWarnings = 0;
try {
  execFileSync(tool("pg_restore"), ["--no-owner", "--no-privileges", "-d", into, dumpFile], { stdio: ["ignore", "inherit", "pipe"] });
} catch (e) {
  /* pg_restore exits non-zero on warnings as well as errors, so the row
     comparison below is the real verdict rather than this exit code. */
  restoreWarnings = 1;
  const text = String(e.stderr ?? e.message ?? "");
  console.log(`  restore : completed with warnings —\n${text.split("\n").slice(0, 8).map((l) => "            " + l).join("\n")}`);
}
const restoreMs = Date.now() - t1;
console.log(`  restore : ${(restoreMs / 1000).toFixed(1)}s`);

/* ---- 3. compare ---------------------------------------------------------- */
const after = tableCounts(into);
const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
const mismatches = [];
for (const n of names) {
  const a = before[n], b = after[n];
  if (a !== b) mismatches.push(`${n}: source ${a ?? "(absent)"} → restored ${b ?? "(absent)"}`);
}

/* ---- 4. the invariant, on BOTH copies ------------------------------------
 *
 * Checked on the source as well, and this is not belt-and-braces. The first
 * version checked only the restored copy, so when a deliberately broken
 * transaction was planted in the source to prove the check bites, the drill
 * reported "this backup does NOT restore faithfully" — blaming the backup for a
 * fault the backup had faithfully preserved. That answer sends someone to
 * debug the wrong system at the worst possible moment. An imbalance that was
 * already in the source is a LEDGER fault; one that appears only after the
 * restore is a RESTORE fault, and they need different people. */
const invSource = unbalancedTx(source);
const inv = unbalancedTx(into);
const preExisting = new Set(invSource.rows.map((r) => r.split("\t")[0]));
const introduced = inv.rows.filter((r) => !preExisting.has(r.split("\t")[0]));

/* ---- 5. verdict --------------------------------------------------------- */
const rtoMs = dumpMs + restoreMs;
console.log("\n== RESULT ==");
console.log(`  tables compared     : ${names.length}`);
console.log(`  row-count mismatches: ${mismatches.length}`);
for (const m of mismatches) console.log(`      x ${m}`);
if (!inv.applicable) {
  console.log("  double-entry check  : no ledger_postings table in this copy");
} else if (!inv.rows.length) {
  console.log("  double-entry check  : every ledger_tx sums to zero");
} else {
  console.log(`  double-entry check  : ${inv.rows.length} UNBALANCED tx (${introduced.length} introduced by the restore, ${inv.rows.length - introduced.length} already broken in the source)`);
  for (const r of inv.rows) console.log(`      x tx ${r}${preExisting.has(r.split("\t")[0]) ? "   (pre-existing — a LEDGER fault, not a restore fault)" : "   (INTRODUCED BY THE RESTORE)"}`);
}
console.log(`  MEASURED RTO        : ${(rtoMs / 1000).toFixed(1)}s  (dump ${(dumpMs / 1000).toFixed(1)}s + restore ${(restoreMs / 1000).toFixed(1)}s)`);

if (keep) console.log(`  dump kept at        : ${dumpFile}`);
else fs.rmSync(path.dirname(dumpFile), { recursive: true, force: true });

/* The restore is judged ONLY on what the restore did: row counts, and
 * imbalances that were not already in the source. A ledger that was already
 * broken is reported loudly and separately, because it is a real problem and a
 * different one. */
const restoreOk = mismatches.length === 0 && introduced.length === 0;
console.log(`\n  ${restoreOk ? "PASS — this backup restores faithfully" : "FAIL — this backup does NOT restore faithfully"}`);
if (invSource.applicable && invSource.rows.length) {
  console.log(`  WARNING — the SOURCE ledger has ${invSource.rows.length} unbalanced transaction(s). The restore preserved them correctly; the ledger itself needs investigating.`);
}
console.log("");
if (!restoreOk) console.log("  Record the output above in launch-audit/ before changing anything.\n");
process.exit(restoreOk ? 0 : 1);
