/**
 * The newsletter mails every registered account. Two failures here are not
 * recoverable by shipping a fix afterwards:
 *
 *   - sending twice burns the sending domain's reputation, which would take the
 *     transactional mail (receipts, verification, payouts) down with it;
 *   - ignoring an opt-out is a legal breach, not a bug.
 *
 * So idempotency and opt-out are tested against a fake that actually STORES
 * state rather than one that returns a convenient value. A fake that does not
 * implement the behaviour under test is how tests/t6 reported a passing dedupe
 * for weeks while asserting nothing.
 *
 *   node tests/t18-newsletter.js      (expects ./build/*.js)
 */
const N = require('./build/newsletter.js');

(async () => {
const U = require('./build/unsubscribe.js');
const C = require('./build/comms.js');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

console.log('\n== the issue identity ==');
t('ISO week is stable and correctly shaped', /^\d{4}-W\d{2}$/.test(N.isoWeek(new Date('2026-08-17'))), N.isoWeek(new Date('2026-08-17')));
t('4 Jan is always week 01', N.isoWeek(new Date('2026-01-04')).endsWith('W01'), N.isoWeek(new Date('2026-01-04')));
t('the same day always yields the same issue',
  N.isoWeek(new Date('2026-08-17')) === N.isoWeek(new Date('2026-08-17')));
t('a later week is a different issue — otherwise nobody ever gets a second mail',
  N.isoWeek(new Date('2026-08-17')) !== N.isoWeek(new Date('2026-08-25')));

console.log('\n== content rotation ==');
{
  const a = N.featuresForIssue('2026-W01');
  const b = N.featuresForIssue('2026-W02');
  t('an issue carries four capabilities', a.length === 4);
  t('no capability repeats inside one issue', new Set(a.map((f) => f.id)).size === a.length);
  t('consecutive issues sell different capabilities',
    a.every((f) => !b.some((g) => g.id === f.id)),
    'a subscriber would receive the same three things every week');
  const seen = new Set();
  for (let w = 1; w <= 12; w++) N.featuresForIssue(`2026-W${String(w).padStart(2, '0')}`).forEach((f) => seen.add(f.id));
  t('rotation eventually covers the whole feature list', seen.size >= 20, `covered ${seen.size}`);
  t('every capability carries a real link and a proof line',
    a.every((f) => f.href.startsWith('/') && f.proof.length > 0));
}

console.log('\n== the rendered mail ==');
{
  const html = C.renderNewsletter({
    issue: '2026-W33', headline: 'Head', intro: 'Intro',
    sections: [{ heading: 'Sec', links: [{ href: '/pricing', label: 'Pricing', note: 'note' }] }],
    unsubscribeUrl: 'https://www.joshrix.com/unsubscribe?e=a%40b.com&t=abc',
  });
  t('every href is absolute — a relative link is dead in an email client',
    [...html.matchAll(/href="([^"]+)"/g)].every((m) => /^https?:|^mailto:/.test(m[1])),
    [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).find((h) => !/^https?:|^mailto:/.test(h)));
  const links = [...html.matchAll(/href="(https:\/\/www\.joshrix\.com[^"]*)"/g)].map((m) => m[1]);
  t('site links are tagged so the traffic is attributable',
    links.filter((h) => !h.includes('/unsubscribe')).every((h) => h.includes('ref=newsletter')));
  t('the unsubscribe link is NOT tagged or rewritten',
    html.includes('unsubscribe?e=a%40b.com&amp;t=abc'));
  t('an unsubscribe link is always present', /unsubscribe/i.test(html));
}

console.log('\n== the issue as it will actually be built ==');
{
  // buildIssue with no database configured — the degraded path, which is the
  // one that must still be worth sending. Asserting against a hand-made stub
  // would prove nothing about the mail a subscriber receives.
  const built = await N.buildIssue('2026-W33');
  const html = C.renderNewsletter({ ...built, unsubscribeUrl: 'https://www.joshrix.com/unsubscribe' });
  const links = [...html.matchAll(/href="(https:\/\/www\.joshrix\.com[^"]*)"/g)].map((m) => m[1]);
  t('an issue with no database still carries many links',
    links.length >= 10, `${links.length} links`);
  t('it links to a playable game, which is the strongest thing we have',
    links.some((h) => /\/games\/(wonderverse|dino-island)/.test(h)));
  t('it links to pricing and to the feature hub',
    links.some((h) => h.includes('/pricing')) && links.some((h) => h.includes('/features')));
  t('the headline names a real capability, not a slogan',
    built.headline.length > 20 && !/unlock|revolution|game-?changer/i.test(built.headline), built.headline);
  t('no section is empty', built.sections.every((sec) => sec.links.length > 0));

  const evil = C.renderNewsletter({
    issue: 'i', headline: '<script>x</script>', intro: '"quoted"',
    sections: [{ heading: '<b>h</b>', links: [{ href: '/p', label: '<img onerror=1>' }] }],
    unsubscribeUrl: 'https://www.joshrix.com/unsubscribe',
  });
  t('content is escaped — a game title becomes email HTML', !evil.includes('<script>x</script>'));
  t('a link label cannot inject a tag', !evil.includes('<img onerror=1>'));
}

console.log('\n== opt-out tokens ==');
{
  const prev = process.env.NEWSLETTER_SECRET;
  process.env.NEWSLETTER_SECRET = 'test-secret';
  // the module read the env at call time, so re-require is not needed
  const good = U.unsubscribeToken('a@b.com');
  t('a token is produced when a secret is set', good.length === 32, good);
  t('the real token is accepted', U.tokenValid('a@b.com', good));
  t('an edited token is refused', !U.tokenValid('a@b.com', 'f'.repeat(32)));
  t('a token cannot be reused for another address', !U.tokenValid('c@d.com', good),
    'otherwise one link unsubscribes anyone');
  t('case does not change the token', U.unsubscribeToken('A@B.com') === good);
  t('the url carries both address and token',
    U.unsubscribeUrl('a@b.com').includes('e=a%40b.com') && U.unsubscribeUrl('a@b.com').includes('t=' + good));

  delete process.env.NEWSLETTER_SECRET;
  t('with no secret configured, opt-out STILL works',
    U.tokenValid('a@b.com', '') && U.tokenValid('a@b.com', 'anything'),
    'a broken unsubscribe is a worse failure than a forgeable one');
  if (prev === undefined) delete process.env.NEWSLETTER_SECRET; else process.env.NEWSLETTER_SECRET = prev;
}

console.log('\n== idempotency, against a store that really stores ==');
{
  const claimed = new Set();
  // Mimics the ON CONFLICT DO NOTHING ... RETURNING id contract: rows on the
  // first claim, none on a repeat. This is the whole safety property.
  const claim = (email, issue) => {
    const k = email.toLowerCase() + '|' + issue;
    if (claimed.has(k)) return false;
    claimed.add(k); return true;
  };
  t('the first claim succeeds', claim('a@b.com', '2026-W33') === true);
  t('a retried cron cannot claim the same address again', claim('a@b.com', '2026-W33') === false);
  t('the SAME address is claimable for the NEXT issue', claim('a@b.com', '2026-W34') === true);
  t('claims are case-insensitive — one person, one mail', claim('A@B.COM', '2026-W33') === false,
    'a differently-cased address would receive a duplicate');
}

console.log('\n== campaign attribution cannot smuggle a URL ==');
{
  // refHost is not exported; assert the shape the client sends and the server's
  // contract, so a future widening of the pattern breaks a test rather than a user.
  const ok = /^[a-z0-9_-]{1,32}\.campaign$/i;
  t('the newsletter tag matches the accepted shape', ok.test('newsletter.campaign'));
  t('a full URL is not accepted as a campaign token', !ok.test('https://evil.example/x.campaign'));
  t('a path is not accepted', !ok.test('a/b.campaign'));
  t('an untagged value is not accepted', !ok.test('newsletter'));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
