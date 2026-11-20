/**
 * A REAL POSTGRES BEHIND THE REAL HANDLERS.
 *
 * Gate 3 of `launch-audit/gates.md` has read "PARTIAL / UNTESTABLE — signup,
 * wallet, forge, publish, moderation and purchase all require a database" since
 * the audit was written. Every test in this suite therefore exercised the
 * handlers against an in-memory stand-in, or read their source. The platform's
 * central flow had never actually run.
 *
 * It can. This container has PostgreSQL 16 installed, and
 * `__setDbForTests` already exists in `api/_ledger.ts` for injecting a client.
 * This module starts a throwaway cluster and injects a client that speaks the
 * same tagged-template interface the Neon driver exposes, so the handlers run
 * UNMODIFIED against real SQL — real constraints, real transactions, real
 * ON CONFLICT behaviour.
 *
 * WHY `pg` AND NOT THE NEON DRIVER. `@neondatabase/serverless` is an HTTP
 * client for Neon's own proxy; it cannot speak to a local Postgres at all. `pg`
 * is a devDependency and is never imported by anything under `api/`, so nothing
 * about the deployed runtime changes.
 *
 * The cluster is created per run, on a private socket, and destroyed at the
 * end. Nothing here can touch a real database: the only URL it knows is the one
 * it just created.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function pgBin(name) {
  try {
    const found = execFileSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).trim();
    if (found) return found;
  } catch { /* packaged location next */ }
  const base = "/usr/lib/postgresql";
  if (!fs.existsSync(base)) return null;
  for (const m of fs.readdirSync(base).filter((d) => /^\d+$/.test(d)).sort((a, b) => Number(b) - Number(a))) {
    const p = path.join(base, m, "bin", name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function postgresAvailable() {
  return !!(pgBin("initdb") && pgBin("pg_ctl"));
}

/**
 * Start a throwaway cluster. Returns { url, stop() } or null when Postgres is
 * not installed — the caller decides whether that is a skip or a failure, and
 * this suite treats it as a failure so a silently skipped database test cannot
 * happen twice (see t16 and t17, which both passed for weeks asserting nothing).
 */
export function startPostgres(port = 5470) {
  if (!postgresAvailable()) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "joshrix-e2e-"));
  const data = path.join(dir, "data");
  fs.mkdirSync(data, { recursive: true });

  /* initdb refuses to run as root, so the cluster runs as `postgres` when this
     process is root, and as the current user otherwise. */
  const asRoot = typeof process.getuid === "function" && process.getuid() === 0;
  const run = (cmd) => {
    const r = asRoot
      ? spawnSync("su", ["postgres", "-c", cmd], { encoding: "utf8" })
      : spawnSync("sh", ["-c", cmd], { encoding: "utf8" });
    return r;
  };
  if (asRoot) execFileSync("chown", ["-R", "postgres:postgres", dir]);
  /* The socket directory must be traversable by the postgres user. */
  for (let p = dir; p !== "/" && p.length > 1; p = path.dirname(p)) {
    try { fs.chmodSync(p, fs.statSync(p).mode | 0o001); } catch { /* best effort */ }
  }

  const init = run(`${pgBin("initdb")} -D ${data} -U joshrix --auth=trust`);
  if (init.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); return null; }
  const start = run(`${pgBin("pg_ctl")} -D ${data} -o '-k ${dir} -p ${port} -c listen_addresses=127.0.0.1' -l ${dir}/pg.log start -w`);
  if (start.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); return null; }
  run(`${pgBin("psql")} -h 127.0.0.1 -p ${port} -U joshrix -d postgres -c "CREATE DATABASE joshrix"`);

  return {
    url: `postgresql://joshrix@127.0.0.1:${port}/joshrix`,
    stop() {
      run(`${pgBin("pg_ctl")} -D ${data} stop -m immediate`);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * A client with the shape `api/_ledger.ts` expects: a tagged template that
 * returns rows.
 *
 * The Neon driver's tagged template builds a parameterised query from the
 * template's static parts and passes the interpolated values as bind
 * parameters. This does exactly the same thing with `pg`, so the handlers'
 * SQL is executed as written and the values are still bound rather than
 * concatenated — injecting through a test client would make every injection
 * assertion in this suite meaningless.
 */
export async function makeSqlClient(url) {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  const sql = async (strings, ...values) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ""), "");
    const res = await client.query(text, values);
    return res.rows;
  };
  sql.end = () => client.end();
  return sql;
}
