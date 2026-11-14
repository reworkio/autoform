'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Ajv = require('ajv/dist/2020');
const lib = require('../lib');

const ROOT = path.join(__dirname, '..');
const json = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const REQUEST = json('examples/request.json');
const DELIVERY = json('examples/delivery.json');
const clone = (o) => JSON.parse(JSON.stringify(o));
const paths = (errors) => errors.map((e) => e.path);

const ajv = new Ajv({ allErrors: true });
const schemaOk = {
  request: ajv.compile(json('schema/request.schema.json')),
  delivery: ajv.compile(json('schema/delivery.schema.json')),
};

test('the examples are valid, by the validator and by the schemas', () => {
  assert.deepStrictEqual(lib.validate(REQUEST), []);
  assert.deepStrictEqual(lib.validate(DELIVERY), []);
  assert.deepStrictEqual(lib.validate(DELIVERY, { request: REQUEST }), []);
  assert.ok(schemaOk.request(REQUEST), JSON.stringify(schemaOk.request.errors));
  assert.ok(schemaOk.delivery(DELIVERY), JSON.stringify(schemaOk.delivery.errors));
});

// Each case breaks one thing. The validator and the schema must both refuse it.
const BROKEN = [
  ['request', 'a wrong version', (d) => { d.autoform = '9'; }, 'autoform'],
  ['request', 'no title', (d) => { delete d.title; }, 'title'],
  ['request', 'a short build', (d) => { d.build = 'Too short.'; }, 'build'],
  ['request', 'one check only', (d) => { d.doneWhen = ['Only one check here']; }, 'doneWhen'],
  ['request', 'six checks', (d) => { d.doneWhen = [1, 2, 3, 4, 5, 6].map((n) => `Check number ${n} holds`); }, 'doneWhen'],
  ['request', 'the same check twice', (d) => { d.doneWhen[1] = d.doneWhen[0]; }, 'doneWhen[1]'],
  ['request', 'hours as text', (d) => { d.hours = 'eight'; }, 'hours'],
  ['request', 'a price', (d) => { d.price = 500; }, 'price'],
  ['request', 'a named client', (d) => { d.clientName = 'Acme Ltd'; }, 'clientName'],
  ['delivery', 'no hours', (d) => { delete d.hours; }, 'hours'],
  ['delivery', 'no answers', (d) => { delete d.checks; }, 'checks'],
  ['delivery', 'a result that is not one of the three', (d) => { d.checks[0].result = 'done'; }, 'checks[0].result'],
  ['delivery', 'an answer with no evidence', (d) => { d.checks[1].evidence = 'yes'; }, 'checks[1].evidence'],
  ['delivery', 'an extra field on an answer', (d) => { d.checks[0].score = 9; }, 'checks[0].score'],
  ['delivery', 'a link that is not a web address', (d) => { d.links.demo = 'see attached'; }, 'links.demo'],
  ['delivery', 'a second revision that does not say what changed', (d) => { d.revision = { number: 2 }; }, 'revision.changes'],
  ['delivery', 'acceptance by a named person', (d) => { d.acceptance = { status: 'accepted', date: '2026-01-05', by: 'Sam Jones' }; }, 'acceptance.by'],
  ['delivery', 'acceptance with no date', (d) => { d.acceptance = { status: 'accepted', by: 'client' }; }, 'acceptance.date'],
  ['delivery', 'a fee', (d) => { d.fee = '2000 USD'; }, 'fee'],
];

for (const [kind, name, breakIt, where] of BROKEN) {
  test(`refused: ${kind} with ${name}`, () => {
    const doc = clone(kind === 'request' ? REQUEST : DELIVERY);
    breakIt(doc);
    assert.ok(paths(lib.validate(doc)).includes(where), `the validator did not point at ${where}: ${JSON.stringify(lib.validate(doc))}`);
    assert.strictEqual(schemaOk[kind](doc), false, 'the schema accepts what the validator refuses');
  });
}

test('optional parts are optional, and a full delivery with revision and acceptance is valid', () => {
  const r = clone(REQUEST);
  for (const k of ['id', 'hours', 'tools', 'followOn']) delete r[k];
  assert.deepStrictEqual(lib.validate(r), []);
  assert.ok(schemaOk.request(r));
  const d = clone(DELIVERY);
  for (const k of ['requestId', 'notIncluded', 'followOn', 'links', 'revision']) delete d[k];
  assert.deepStrictEqual(lib.validate(d), []);
  assert.ok(schemaOk.delivery(d));
  const full = clone(DELIVERY);
  full.revision = { number: 2, changes: 'The scanned invoice is now read with a second pass.' };
  full.acceptance = { status: 'accepted', date: '2026-01-05', by: 'client' };
  assert.deepStrictEqual(lib.validate(full, { request: REQUEST }), []);
  assert.ok(schemaOk.delivery(full), JSON.stringify(schemaOk.delivery.errors));
  full.acceptance.date = '2026-02-30';
  assert.deepStrictEqual(paths(lib.validate(full)), ['acceptance.date'], 'a date that does not exist was accepted');
});

test('the tie: a delivery answers every check of its request, in order, and no other', () => {
  const tie = (change) => { const d = clone(DELIVERY); change(d); return lib.validate(d, { request: REQUEST }); };
  const missing = tie((d) => { d.checks.pop(); });
  assert.ok(missing.some((e) => /check 3 has no answer/.test(e.message)), JSON.stringify(missing));
  const reworded = tie((d) => { d.checks[0].check = 'Most of the invoices are read into the sheet'; });
  assert.ok(reworded.some((e) => /has no answer/.test(e.message)) && reworded.some((e) => /not in the request/.test(e.message)));
  const swapped = tie((d) => { d.checks.reverse(); });
  assert.ok(swapped.some((e) => /follow the order/.test(e.message)));
  assert.deepStrictEqual(tie((d) => { d.checks[0].check = `  ${d.checks[0].check.toUpperCase()}  `; }), [], 'case or spacing broke the tie');
  assert.ok(tie((d) => { d.requestId = 'another-request'; }).some((e) => e.path === 'requestId'));
  // Without the request the delivery is still checked by itself.
  const alone = clone(DELIVERY); alone.checks.pop();
  assert.deepStrictEqual(lib.validate(alone), []);
});

test('the text form reads back to the same document', () => {
  for (const doc of [REQUEST, DELIVERY]) assert.deepStrictEqual(lib.parse(lib.render(doc)), doc);
  const full = clone(DELIVERY);
  full.checks[0].result = 'not_met';
  full.revision = { number: 3, changes: 'Fixed the duplicate check and the review list.' };
  full.acceptance = { status: 'not_accepted', date: '2026-01-05', by: 'reviewer' };
  assert.deepStrictEqual(lib.parse(lib.render(full)), full);
  assert.match(lib.render(full), /- \[not met\] All 50 sample invoices/);
  assert.strictEqual(fs.readFileSync(path.join(ROOT, 'examples/request.txt'), 'utf8'), lib.render(REQUEST), 'examples/request.txt is stale');
  assert.strictEqual(fs.readFileSync(path.join(ROOT, 'examples/delivery.txt'), 'utf8'), lib.render(DELIVERY), 'examples/delivery.txt is stale');
});

test('text with line breaks is one line in the text form, and still valid', () => {
  const d = clone(DELIVERY);
  d.tested = 'Ran all 50 sample invoices twice.\n49 were read fully.';
  assert.deepStrictEqual(lib.validate(d), []);
  assert.strictEqual(lib.parse(lib.render(d)).tested, 'Ran all 50 sample invoices twice. 49 were read fully.');
});

test('parse refuses what is not Autoform, and says which line', () => {
  assert.throws(() => lib.parse('Title: no header\n'), /first line/);
  assert.throws(() => lib.parse('Autoform request 0.1\nPrice: 500\n'), /Line 2: "Price" is not a line/);
  assert.throws(() => lib.parse('Autoform delivery 0.1\nChecks:\n- met without brackets\n'), /Line 3/);
  assert.throws(() => lib.parse('Autoform delivery 0.1\nSuggested tools: n8n\n'), /Line 2/);
});

test('the schemas carry the same limits as the validator', () => {
  const r = json('schema/request.schema.json');
  const d = json('schema/delivery.schema.json');
  assert.deepStrictEqual(Object.keys(r.properties).sort(), [...lib.REQUEST_KEYS].sort());
  assert.deepStrictEqual(Object.keys(d.properties).sort(), [...lib.DELIVERY_KEYS].sort());
  assert.deepStrictEqual([r.properties.title.minLength, r.properties.title.maxLength], lib.LIMITS.title);
  assert.deepStrictEqual([r.properties.doneWhen.minItems, r.properties.doneWhen.maxItems], lib.LIMITS.checks);
  assert.deepStrictEqual([d.properties.checks.minItems, d.properties.checks.maxItems], lib.LIMITS.checks);
  assert.deepStrictEqual(d.properties.checks.items.properties.result.enum, lib.RESULTS);
  assert.strictEqual(r.properties.autoform.const, lib.VERSION);
  assert.strictEqual(d.properties.autoform.const, lib.VERSION);
});

const CLI = path.join(ROOT, 'bin', 'cli.js');
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd: ROOT });

test('cli: validate, with and without the request, in either form', () => {
  assert.strictEqual(run(['validate', 'examples/request.json']).status, 0);
  assert.strictEqual(run(['validate', 'examples/request.txt']).status, 0);
  const tied = run(['validate', 'examples/delivery.txt', '--request', 'examples/request.json']);
  assert.strictEqual(tied.status, 0, tied.stdout + tied.stderr);
  assert.match(tied.stdout, /answers every check/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoform-'));
  const bad = clone(DELIVERY); bad.checks.pop();
  fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify(bad));
  const out = run(['validate', path.join(dir, 'bad.json'), '--request', 'examples/request.json']);
  assert.strictEqual(out.status, 1);
  assert.match(out.stdout, /check 3 has no answer/);
  assert.strictEqual(run(['validate', path.join(dir, 'bad.json')]).status, 0);
});

test('cli: render and parse convert between the forms; bad usage exits 2', () => {
  assert.strictEqual(run(['render', 'examples/delivery.json']).stdout, lib.render(DELIVERY));
  assert.deepStrictEqual(JSON.parse(run(['parse', 'examples/request.txt']).stdout), REQUEST);
  assert.strictEqual(run(['validate']).status, 2);
  assert.strictEqual(run(['validate', 'nope.json']).status, 2);
  assert.strictEqual(run(['frobnicate', 'examples/request.json']).status, 2);
  assert.strictEqual(run(['validate', 'examples/request.json', '--request', 'examples/request.json']).status, 2);
  assert.strictEqual(run([]).status, 2);
});
