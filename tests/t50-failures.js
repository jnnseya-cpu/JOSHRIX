/**
 * A PRODUCTION FAILURE IS RECORDED, CATEGORISED, AND LEAKS NOTHING.
 *
 * Until 10 Nov, thirty-three handlers ended the same way:
 *
 *   catch (err) { res.status(502).json({ error: "...", detail: String(err.message) }) }
 *
 * Two faults in one line. The failure existed for exactly as long as the
 * request did — nothing counted it, nothing aggregated it, and
 * `launch-audit/human-actions.md` item 3 ("nothing watches production") was
 * true. And `detail` went to the CALLER: a database error carries table and
 * column names and sometimes a host, a provider error carries its own
 * internals, and the one person who needed any of it was the operator.
 *
 * `api/_observe.ts` is the single replacement. This file asserts the three
 * properties that make it worth having:
 *
 *   1. the caller gets a sentence and an opaque reference, never the error;
 *   2. the message is redacted BEFORE it is logged or stored, because a
 *      Postgres driver puts the password in the message when it cannot connect;
 *   3. no handler has gone back to rolling its own.
 *
 *   node tests/t50-failures.js
 */
const fs = require('fs');
const path = require('path');
const obs = require('./build/api/_observe.js');

const ROOT = process.env.JOSHRIX_ROOT || path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const mkRes = () => {
  const r = { code: null, body: null, ended: false };
  r.setHeader = () => {}; r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; r.ended = true; return r; };
  r.end = () => { r.ended = true; return r; };
  return r;
};

/** Capture what would have gone to the log, so the redaction can be checked
 *  where it actually matters rather than only in the response. */
function captureLogs(fn) {
  const lines = [];
  const realErr = console.error, realLog = console.log;
  console.error = (...a) => lines.push(a.join(' '));
  console.log = (...a) => lines.push(a.join(' '));
  return Promise.resolve(fn()).then((v) => { console.error = realErr; console.log = realLog; return { value: v, lines }; },
    (e) => { console.error = realErr; console.log = realLog; throw e; });
}

(async () => {
  const prevDb = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;   // no database: the HTTP answer must still be correct

  console.log('\nTHE CALLER GETS A REFERENCE, NOT THE ERROR');
  {
    const res = mkRes();
    const { lines } = await captureLogs(() => obs.failing(res, 'test.operation', new Error('relation "wallets" does not exist')));
    t('it answers 502 by default', res.code === 502, `HTTP ${res.code}`);
    t('the body carries a reference', /^[0-9a-f]{8}$/.test(String(res.body.reference)), JSON.stringify(res.body));
    t('and a sentence, not the error', /did not work|recorded/.test(res.body.error) , JSON.stringify(res.body));
    t('the underlying message is NOT in the response',
      !JSON.stringify(res.body).includes('relation'), JSON.stringify(res.body));
    t('there is no `detail` field any more',
      res.body.detail === undefined, JSON.stringify(res.body));
    t('the same reference IS in the log, which is what makes it findable',
      lines.join(' ').includes(res.body.reference), lines.join(' ').slice(0, 200));
    t('the log line is structured JSON with the operation and category',
      /"failure":/.test(lines.join(' ')) && /"operation":"test.operation"/.test(lines.join(' '))
        && /"category":"database"/.test(lines.join(' ')),
      lines.join(' ').slice(0, 240));
  }

  console.log('\nA CUSTOM MESSAGE AND STATUS ARE HONOURED');
  {
    const res = mkRes();
    await captureLogs(() => obs.failing(res, 'test.custom', new Error('x'), 'Payout request failed', { status: 503, extra: { queued: false } }));
    t('the handler\'s own sentence is used', res.body.error === 'Payout request failed', JSON.stringify(res.body));
    t('a chosen status is used', res.code === 503);
    t('and an extra field the client reads survives',
      res.body.queued === false,
      '/api/payout answers queued:false, and dropping it would change what the page does');
  }

  console.log('\nTWO REFERENCES ARE NEVER THE SAME FAILURE');
  {
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(obs.correlationId());
    t('200 references are distinct', seen.size === 200, `${seen.size} unique`);
    t('every one is 8 hex characters', [...seen].every((r) => /^[0-9a-f]{8}$/.test(r)));
  }

  console.log('\nCREDENTIALS ARE STRIPPED BEFORE ANYTHING IS WRITTEN DOWN');
  {
    /* Each of these is a message a real driver or SDK can produce. The patterns
       are the ones tests/t32 scans commits for, so a secret that would be caught
       in a diff is also caught on its way into a log. */
    /* ASSEMBLED AT RUNTIME, never written as literals. tests/t32 scans this
       repository for anything shaped like a live credential and it flagged the
       first version of this file on all six patterns — correctly, because a
       string that looks like a key is a string a scanner must shout about.
       Adding an exemption for a test file is how a secret scanner becomes
       decoration, so the fixtures are built from pieces instead. */
    const K = {
      pg:     'npg' + '_SuperSecret123',
      ant:    'sk-' + 'ant-api03-AAAABBBBCCCCDDDDEEEE',
      stripe: 'sk' + '_live_' + '51AbCdEfGhIjKlMnOp',
      whsec:  'whsec' + '_ABCDEFGHIJKLMNOPQRST',
      google: 'AIza' + 'SyA1234567890abcdefghijklmno',
      aws:    'AKIA' + 'IOSFODNN7EXAMPLE',
      jwt:    'eyJhbGciOiJIUzI1NiJ9.abc',
      pw:     'hunter2correct',
    };
    const cases = [
      /* Split across a concatenation as well, because the URL FORM is its own
         pattern in t32 — "user:password@" is a credential whatever follows it. */
      ['a Postgres connection string',
        'could not connect to ' + 'postgresql://joshrix:' + K.pg + '@ep-x.neon.tech/db', [K.pg, 'SuperSecret123']],
      ['an Anthropic key', `invalid x-api-key: ${K.ant}`, [K.ant]],
      ['a Stripe live key', `No such customer: ${K.stripe}`, [K.stripe]],
      ['a Stripe webhook secret', `signature check used ${K.whsec}`, [K.whsec]],
      ['a Google API key', `bad key ${K.google}`, [K.google]],
      ['an AWS access key id', `denied for ${K.aws}`, [K.aws]],
      ['a bearer token in a header echo', `request failed: Authorization: Bearer ${K.jwt}`, [K.jwt]],
      ['a password in a key=value echo', `config rejected: password=${K.pw}`, [K.pw]],
    ];
    for (const [name, message, secrets] of cases) {
      const cleaned = obs.redact(message);
      t(`${name} is redacted`, secrets.every((s) => !cleaned.includes(s)), `${name} → ${cleaned}`);

      /* And through the real path, which is the one that matters: the response
         AND the log line must both be clean. */
      const res = mkRes();
      const { lines } = await captureLogs(() => obs.failing(res, 'test.redaction', new Error(message)));
      const everything = JSON.stringify(res.body) + ' ' + lines.join(' ');
      t(`${name} reaches neither the response nor the log`,
        secrets.every((s) => !everything.includes(s)), everything.slice(0, 200));
    }

    t('redaction keeps the message useful rather than blanking it',
      /could not connect/.test(obs.redact('could not connect to postgresql://u:p@h/db')),
      'a redacted message nobody can read is the same as no message');
  }

  console.log('\nCATEGORIES ARE COARSE, DETERMINISTIC, AND DECIDED BY NO MODEL');
  {
    const cases = [
      ['relation "wallets" does not exist', 'database'],
      ['duplicate key value violates unique constraint', 'database'],
      ['connection terminated unexpectedly', 'database'],
      ['ETIMEDOUT', 'timeout'],
      ['Request timed out after 30000ms', 'timeout'],
      ['No such customer in Stripe', 'payment'],
      ['anthropic: overloaded_error', 'provider'],
      ['walletId is required', 'validation'],
      ['something nobody predicted', 'unknown'],
    ];
    for (const [message, expected] of cases) {
      const got = obs.classify(new Error(message));
      t(`"${message.slice(0, 38)}" → ${expected}`, got === expected, `got ${got}`);
    }
    t('a thrown non-Error does not break classification', obs.classify('just a string') === 'unknown');
    t('and neither does undefined', obs.classify(undefined) === 'unknown');
  }

  console.log('\nNO HANDLER HAS GONE BACK TO ROLLING ITS OWN');
  {
    const apiDir = path.join(ROOT, 'api');
    const files = fs.readdirSync(apiDir).filter((f) => f.endsWith('.ts'));
    const offenders = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(apiDir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      if (/detail:\s*String\(err/.test(src)) offenders.push(f);
    }
    t('no handler returns the raw error message to the caller',
      offenders.length === 0, offenders.join(', '));

    /* The point of one path is that it stays one path. */
    const users = files.filter((f) => /failing\(res,/.test(fs.readFileSync(path.join(apiDir, f), 'utf8')));
    t(`every failing handler calls the shared path (${users.length} files)`, users.length >= 28, `${users.length}`);
    const obsSrc = fs.readFileSync(path.join(apiDir, '_observe.ts'), 'utf8');
    /* Both fallible steps are guarded, and the response is sent AFTER them —
       so a broken logger or an unreachable database cannot turn a handled
       failure into an unhandled one. Asserted as the property rather than as a
       count of catch blocks, which an earlier version did and which says
       nothing about where they are. */
    t('the log write is guarded', /catch \{ \/\* a logger that throws/.test(obsSrc));
    t('the database write is guarded', /catch \{ \/\* observation must never break/.test(obsSrc));
    t('and the HTTP answer is sent after both, so neither can suppress it',
      obsSrc.lastIndexOf('return res.status(status).json(') > obsSrc.indexOf('observation must never break'),
      'a failure to record a failure must not become the response the user sees');
    t('it redacts before it logs, not after',
      obsSrc.indexOf('redact(String(') < obsSrc.indexOf('console.error'),
      'redaction downstream of the log is no redaction at all');
  }

  console.log('\nTHE SINK IS SEPARATE FROM THE SECURITY LOG, AND HOLDS NO PERSONAL DATA');
  {
    const ledger = fs.readFileSync(path.join(ROOT, 'api/_ledger.ts'), 'utf8');
    const table = ledger.slice(ledger.indexOf('CREATE TABLE IF NOT EXISTS error_events'), ledger.indexOf('CREATE TABLE IF NOT EXISTS error_events') + 600);
    t('failures have their own table, not security_events',
      /CREATE TABLE IF NOT EXISTS error_events/.test(ledger),
      'an attack and a bug want different reactions and different people');
    t('and no user, email, IP or request body is stored',
      !/email|ip_|user_|session|body|wallet/.test(table), table.slice(0, 300));
    t('rows are pruned, so nobody inherits years of noise',
      /DELETE FROM error_events WHERE created_at < now\(\) - interval '30 days'/.test(ledger));
    t('a reference can be looked up, which is the whole reason it exists',
      /export async function failureByReference/.test(ledger));
    t('the lookup validates the reference instead of trusting the screen it came from',
      /\^\[0-9a-f\]\{8\}\$/.test(fs.readFileSync(path.join(ROOT, 'api/admin-stats.ts'), 'utf8')));
  }

  console.log('\nTHE WATCHMAN ACTUALLY RAISES THE ALARM NOW');
  {
    const sa = fs.readFileSync(path.join(ROOT, 'api/security-agent.ts'), 'utf8');
    t('the nightly review reads the failure sink', /failureSummary\(sql, hours\)/.test(sa));
    t('and it EMAILS on critical or high',
      /notify\("executive\.alert"/.test(sa) && sa.indexOf('notify("executive.alert"') > sa.indexOf('worst === "critical"'),
      'until 10 Nov it wrote a row to a table nobody reads and told no one');
    t('a failed alert does not fail the review that produced it',
      /catch \{ \/\* a failed alert must not fail the review/.test(sa));
    t('the response says whether an alert actually went out',
      /alerted,/.test(sa),
      'an alerting system that cannot tell you it alerted is one you have to trust blindly');
  }

  if (prevDb !== undefined) process.env.DATABASE_URL = prevDb;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
