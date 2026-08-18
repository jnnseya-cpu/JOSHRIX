/**
 * The blueprint is the first step of every forge. When it fails the creator
 * cannot proceed at all — and it failed in the least legible way possible:
 *
 *   "Blueprint generation failed — Expected ',' or ']' after array element in
 *    JSON at position 6220 (line 1 column 6221)"
 *
 * That reads like a malformed model reply. It was a TRUNCATED reply, cut in the
 * wrong place by us: the old extraction took indexOf("{") to lastIndexOf("}"),
 * so when a reply stopped mid-array, lastIndexOf landed on the closing brace of
 * a nested object and the slice ended inside an array that was never closed.
 *
 * These cases are the ones that actually happen to model output.
 *
 *   node tests/t20-blueprint-json.js      (expects ./build/_gateway.js)
 */
const G = require('./build/_gateway.js');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };
const ok = (text) => { const j = G.extractJsonObject(text); return j && JSON.parse(j); };

console.log('\n== the truncation that produced the position-6220 error ==');
{
  // A reply cut off mid-array, exactly as a max_tokens stop does it.
  const truncated = '{"title":"X","levels":[{"n":1,"name":"Dawn"},{"n":2,"name":"Du';
  t('a reply truncated mid-array yields null, not a broken slice',
    G.extractJsonObject(truncated) === null,
    'returning a slice here is what produced "Expected \',\' or \']\'"');

  // The precise old failure: lastIndexOf finds a NESTED closing brace.
  const nested = '{"a":1,"list":[{"b":2},{"c":3}';
  const oldWay = nested.slice(nested.indexOf('{'), nested.lastIndexOf('}') + 1);
  let oldThrew = false;
  try { JSON.parse(oldWay); } catch (e) { oldThrew = /Expected .,. or .\]./.test(e.message); }
  t('the OLD extraction reproduces the exact reported error', oldThrew, oldWay);
  t('the new extraction refuses it instead', G.extractJsonObject(nested) === null);
}

console.log('\n== ordinary model replies still parse ==');
t('plain object', ok('{"a":1}').a === 1);
t('prose before and after the JSON',
  ok('Here is your blueprint:\n{"a":1,"b":[1,2,3]}\nHope that helps!').b.length === 3);
t('fenced in a markdown code block',
  ok('```json\n{"title":"Reef","levels":[{"n":1}]}\n```').title === 'Reef');
t('deeply nested objects and arrays',
  ok('{"a":{"b":{"c":[{"d":[1,2,{"e":3}]}]}}}').a.b.c[0].d[2].e === 3);
t('unicode and accented copy survive',
  ok('{"title":"Forêt Épique","tag":"jeu 🎮"}').title === 'Forêt Épique');

console.log('\n== braces inside strings must not end the object early ==');
t('a closing brace inside a string value',
  ok('{"note":"use } carefully","n":7}').n === 7,
  'a naive depth counter stops at the brace in the string and loses "n"');
t('an escaped quote before a brace',
  ok('{"note":"he said \\"} done\\"","n":8}').n === 8);
t('a backslash immediately before the closing quote',
  ok('{"path":"C:\\\\\\\\dir\\\\\\\\","n":9}').n === 9);
t('braces and brackets together inside a string',
  ok('{"tpl":"{{a}} [b] }]","n":10}').n === 10);

console.log('\n== it takes the FIRST complete object ==');
{
  const two = '{"first":1}\n{"second":2}';
  const got = ok(two);
  t('trailing second object is ignored', got.first === 1 && got.second === undefined);
  t('trailing prose containing a brace is ignored',
    ok('{"a":1}\nNote: use {} for empty.').a === 1);
}

console.log('\n== degenerate input is refused, never guessed ==');
t('empty string', G.extractJsonObject('') === null);
t('no JSON at all', G.extractJsonObject('I could not produce a blueprint.') === null);
t('an opening brace and nothing else', G.extractJsonObject('{') === null);
t('an unterminated string', G.extractJsonObject('{"a":"never closed') === null);
t('array at top level is not an object', G.extractJsonObject('[1,2,3]') === null);

console.log('\n== the real shape, at size ==');
{
  // Deliberately past 6,220 bytes — the position the live failure reported —
  // with strings full of the punctuation that breaks naive extraction.
  const levels = Array.from({ length: 90 }, (_, i) =>
    ({ n: i + 1, name: `Level ${i + 1}`, brief: 'Collect } and avoid [ traps ] — "carefully"' }));
  const big = JSON.stringify({ title: 'Big', levels, mechanics: ['a', 'b'], audience: 'all' });
  t(`a ${big.length}-byte blueprint round-trips intact (> 6220)`,
    big.length > 6220 &&
    JSON.parse(G.extractJsonObject('Here you go:\n' + big + '\nDone.')).levels.length === 90,
    `must exceed the 6220 bytes at which the live failure hit`);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
