/**
 * WHERE CHROMIUM ACTUALLY IS, resolved once for the whole suite.
 *
 * This existed five times, copy-pasted into t22, t25, t26, t27 and t28, each
 * returning `<base>/chromium-<rev>/chrome-linux/chrome`. On 7 Nov 2026 a
 * routine `npm install` moved Playwright to 1.62.1 in a container whose
 * pre-installed browser lives in `chrome-linux64`, and all five failed at once
 * with "executable doesn't exist" while t34 kept passing — because t34 used the
 * stable symlink instead. Five copies of a guess, one copy of the right answer.
 *
 * So there is one copy now, and it prefers what the environment actually
 * documents: a `chromium` symlink next to the revision directories, which the
 * image maintains across Playwright and Chromium upgrades. The revision probe
 * stays as a fallback and now tries BOTH layouts, because the directory name has
 * changed once and may change again.
 *
 * Returning undefined is deliberate and is not a failure: Playwright then
 * resolves the browser itself, which is correct on a developer machine that
 * installed its own.
 */
import fs from "node:fs";
import path from "node:path";

export function findChromium() {
  /* An explicit override always wins — it is how a developer points the suite at
     a system Chrome. */
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";

  /* The stable symlink, which is what this image tells callers to use. It
     survives the revision bump that broke the probe below. */
  const stable = path.join(base, "chromium");
  try { if (fs.existsSync(stable)) return stable; } catch { /* fall through */ }

  /* Otherwise find the newest revision directory and try both layouts Chromium
     has shipped: chrome-linux64 is current, chrome-linux is what it used to be. */
  try {
    const revs = fs.readdirSync(base)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    for (const dir of revs) {
      for (const layout of ["chrome-linux64", "chrome-linux"]) {
        const exe = path.join(base, dir, layout, "chrome");
        if (fs.existsSync(exe)) return exe;
      }
    }
  } catch { /* let playwright look */ }

  return undefined;
}
