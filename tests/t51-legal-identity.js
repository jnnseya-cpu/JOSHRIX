/**
 * THE PUBLISHED LEGAL IDENTITY IS ONE IDENTITY.
 *
 * On 17 Nov 2026 the ICO registration number arrived, and with it a problem this
 * repository already knows well: a business value that has to appear in several
 * places. It is now in the privacy policy, the terms, the contact page and the
 * site's structured data — four files, one fact.
 *
 * A stale commission rate is embarrassing. A stale REGISTRATION NUMBER is a
 * misleading public statement about a regulated registration, on the one page a
 * regulator would read first. So `shared/legal.ts` holds it once and this file
 * asserts that every place stating a registration number states that one.
 *
 * The static pages must carry the digits as literal text — they are plain HTML
 * and cannot import a constant — so this test is the only thing standing
 * between them and drift.
 *
 * It also checks the gap the number exposed. UK GDPR Article 13(1)(a) requires
 * the controller's identity and contact details to be given to the data
 * subject. The privacy policy described in detail what was collected, why, and
 * for how long, and never said WHO was collecting it.
 *
 * WHAT THIS CANNOT DO: confirm the number is registered, or that it belongs to
 * this controller. Only the ICO's register can, and this environment cannot
 * reach it. The number is published as supplied by its owner; what is asserted
 * here is consistency and shape, and nothing is reported as verification.
 *
 *   node tests/t51-legal-identity.js
 */
const fs = require('fs');
const path = require('path');
const { LEGAL, ICO_NUMBER_PATTERN } = require('./build/shared/legal.js');
const seo = require('./build/api/_seo.js');

const ROOT = process.env.JOSHRIX_ROOT || path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const PAGES = path.join(ROOT, 'frontend');
const html = (f) => fs.readFileSync(path.join(PAGES, f), 'utf8');

/* Wrapped because one block AWAITS the real /llms.txt handler. This file is
   CommonJS, so a top-level await makes the module format ambiguous and nothing
   runs at all — the same trap tests/t47 fell into. */
(async () => {
console.log('\nthe source of truth');
{
  t('the registration number is declared once, in shared/legal.ts',
    typeof LEGAL.icoRegistration === 'string' && LEGAL.icoRegistration.length > 0);
  t(`its shape matches the ICO's current scheme (${LEGAL.icoRegistration})`,
    ICO_NUMBER_PATTERN.test(LEGAL.icoRegistration),
    'a format check only — the register is the only thing that can confirm a registration');
  t('the controller is named', LEGAL.controller === 'JOSHRIX Studio');
  t('and the regulator is named in full, not just as an acronym',
    /Information Commissioner/.test(LEGAL.regulator), LEGAL.regulator);
}

console.log('\nevery page that states a registration number states THAT one');
{
  /* Found rather than listed. A fifth page that adds a registration number
     later is caught without anyone remembering to add it here, which is the
     whole difference between a test and a checklist. */
  const files = fs.readdirSync(PAGES).filter((f) => f.endsWith('.html'));
  const NUMBERISH = /\b(?:C\d{7}|Z[A-B]?\d{6,7})\b/g;
  const pagesWithNumber = [];
  const wrong = [];
  for (const f of files) {
    const src = html(f);
    const found = src.match(NUMBERISH);
    if (!found) continue;
    pagesWithNumber.push(f);
    for (const n of new Set(found)) if (n !== LEGAL.icoRegistration) wrong.push(`${f}: ${n}`);
  }
  t('no page states a registration number other than the declared one',
    wrong.length === 0, wrong.join(', '));
  t('and at least the privacy policy, the terms and the contact page state it',
    ['privacy.html', 'terms.html', 'contact.html'].every((f) => pagesWithNumber.includes(f)),
    pagesWithNumber.join(', '));
}

console.log('\nArticle 13(1)(a) — the privacy policy says WHO is collecting');
{
  const p = html('privacy.html');
  t('it names the data controller', /data controller/i.test(p) && p.includes(LEGAL.controller));
  t('it gives the ICO registration number', p.includes(LEGAL.icoRegistration));
  t('it gives a route for a data-subject request',
    /contact\.html/.test(p),
    'a policy that lists your rights and no way to exercise them is not a policy');
  t('it still names the complaint route to the regulator',
    /ico\.org\.uk/.test(p),
    'the right to complain to the ICO is separate from our own registration with it');
  t('and it states the governing law',
    new RegExp(LEGAL.jurisdiction).test(p), LEGAL.jurisdiction);

  /* The block was added ABOVE section 1 rather than inserted as a new numbered
     section, so every existing cross-reference and anchor still means what it
     said. */
  t('the existing section numbering was not disturbed',
    p.indexOf('<h2>Who we are</h2>') < p.indexOf('<h2>1. What we collect</h2>')
      && /<h2>8\. Changes<\/h2>/.test(p),
    'renumbering eight sections to add one would break every reference to them');
}

console.log('\nthe terms and the privacy policy do not contradict each other');
{
  const terms = html('terms.html');
  t('the terms state the same controller and number',
    terms.includes(LEGAL.controller) && terms.includes(LEGAL.icoRegistration));
  t('and the same governing law the terms already used',
    new RegExp(LEGAL.jurisdiction).test(terms),
    'shared/legal.ts carries the jurisdiction so the two pages cannot drift apart');
  t('the terms point at the privacy policy for data handling',
    /privacy\.html/.test(terms));
}

console.log('\nit is machine-readable too, not only prose');
{
  const org = seo.orgNode();
  t('the Organization node carries an identifier',
    org.identifier && org.identifier['@type'] === 'PropertyValue', JSON.stringify(org.identifier));
  t('and it is the declared number, from the same constant',
    org.identifier.value === LEGAL.icoRegistration, String(org.identifier && org.identifier.value));
  t('named so a machine knows what the value is',
    /ICO registration/.test(org.identifier.name), String(org.identifier && org.identifier.name));
  t('the organisation name comes from the constant as well',
    org.name === LEGAL.controller,
    'two sources for the publisher name is how the structured data ends up disagreeing with the footer');
  t('the node is still valid JSON-LD shape',
    org['@type'] === 'Organization' && typeof org['@id'] === 'string');
}

console.log('\nand the answer-engine brief carries it, generated not typed');
{
  /* /llms.txt is the file an answer engine reads to decide whether to trust and
     cite this site, and it already carried the operator identity. Publisher
     identity is part of that judgement, so the controller and registration are
     stated there too — interpolated from the constant, so this one cannot drift
     even in principle. */
  const llms = require('./build/api/llms.js');
  let body = '';
  const res = {
    setHeader: () => {}, status: () => res,
    send: (b) => { body = b; return res; },
    end: (b) => { body = b || body; return res; },
  };
  const prevDb = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  await llms.default({ method: 'GET', headers: {}, query: {} }, res);
  if (prevDb !== undefined) process.env.DATABASE_URL = prevDb;

  t('the brief was generated', /# JOSHRIX Studio/.test(body), String(body).slice(0, 80));
  t('it names the data controller', body.includes(LEGAL.controller));
  t('and the registration number', body.includes(LEGAL.icoRegistration));
  t('interpolated from the constant rather than typed into the template',
    !/C\d{7}/.test(fs.readFileSync(path.join(ROOT, 'api/llms.ts'), 'utf8')),
    'a literal here would be a fifth copy of the number, outside the page sweep above');
}

console.log('\nnothing here claims to have been verified');
{
  const legalSrc = fs.readFileSync(path.join(ROOT, 'shared/legal.ts'), 'utf8');
  t('shared/legal.ts says plainly that the number was not verified from here',
    /NOT VERIFIED FROM HERE/.test(legalSrc) && /cannot reach ico\.org\.uk/.test(legalSrc),
    'the proxy refuses ico.org.uk, so the register could not be checked');
  t('and the shape check is labelled as a shape check',
    /format check and nothing more|A shape check, NOT a confirmation/.test(legalSrc));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
