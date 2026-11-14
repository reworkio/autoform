'use strict';
/**
 * Autoform: one request for a piece of automation work, and the delivery
 * that answers it. See SPEC.md.
 *
 * Two documents, each with a JSON form and a plain-text form:
 *
 *   request    what to build, for whom, on what data, and the checks that
 *              say it is done
 *   delivery   what was built, how to try it, what was tested, what the
 *              client must provide, and an answer to every check
 *
 * The one rule a schema cannot hold is the tie between them: a delivery
 * answers each "done when" check of its request, in order, with a result and
 * the evidence for it. validateDelivery(delivery, request) checks that.
 */

const VERSION = '0.1';

const LIMITS = {
  title: [8, 120],
  answer: [20, 2000],
  build: [40, 2000],
  check: [5, 300],
  evidence: [10, 1000],
  checks: [2, 5],
  hours: [1, 2000],
  tools: 20,
  tool: [1, 60],
  id: [1, 120],
  changes: [10, 1000],
};

const RESULTS = ['met', 'partly', 'not_met'];
const ACCEPTANCE = ['accepted', 'not_accepted'];
const ACCEPTED_BY = ['client', 'reviewer'];

const REQUEST_KEYS = ['autoform', 'kind', 'id', 'title', 'audience', 'build', 'data', 'handIn', 'doneWhen', 'hours', 'tools', 'followOn'];
const DELIVERY_KEYS = ['autoform', 'kind', 'requestId', 'title', 'whatItDoes', 'howToTry', 'tested', 'clientProvides', 'checks', 'notIncluded', 'hours', 'followOn', 'links', 'revision', 'acceptance'];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** Text as the format reads it: one line, single spaces. */
const one = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

function collector() {
  const errors = [];
  const add = (path, message) => { errors.push({ path, message }); };
  const text = (doc, key, [min, max], what, required = true) => {
    const v = doc[key];
    if (v === undefined) { if (required) add(key, `${what} is missing.`); return; }
    if (typeof v !== 'string') { add(key, `${what} must be text.`); return; }
    const n = one(v).length;
    if (n < min) add(key, `${what} needs at least ${min} characters.`);
    else if (n > max) add(key, `${what} must be at most ${max} characters.`);
  };
  const unknown = (doc, allowed, prefix = '') => {
    for (const k of Object.keys(doc)) if (!allowed.includes(k)) add(prefix + k, 'This field is not part of Autoform.');
  };
  const header = (doc, kind) => {
    if (doc.autoform !== VERSION) add('autoform', `The version must be "${VERSION}".`);
    if (doc.kind !== kind) add('kind', `The kind must be "${kind}".`);
  };
  const hours = (doc, required) => {
    if (doc.hours === undefined) { if (required) add('hours', 'The hours are missing.'); return; }
    if (typeof doc.hours !== 'number' || !Number.isFinite(doc.hours) || doc.hours < LIMITS.hours[0] || doc.hours > LIMITS.hours[1]) {
      add('hours', `The hours must be a number from ${LIMITS.hours[0]} to ${LIMITS.hours[1]}.`);
    }
  };
  return { errors, add, text, unknown, header, hours };
}

function validateRequest(doc) {
  const c = collector();
  if (!isObject(doc)) return [{ path: '', message: 'A request is an object.' }];
  c.unknown(doc, REQUEST_KEYS);
  c.header(doc, 'request');
  c.text(doc, 'id', LIMITS.id, 'The id', false);
  c.text(doc, 'title', LIMITS.title, 'The title');
  c.text(doc, 'audience', LIMITS.answer, 'Who it is for');
  c.text(doc, 'build', LIMITS.build, 'What to build');
  c.text(doc, 'data', LIMITS.answer, 'What to build it on');
  c.text(doc, 'handIn', LIMITS.answer, 'What to hand in');
  c.text(doc, 'followOn', LIMITS.answer, 'The follow-on work', false);
  c.hours(doc, false);
  if (doc.hours !== undefined && !Number.isInteger(doc.hours)) c.add('hours', 'A request gives its hours as a whole number.');

  if (!Array.isArray(doc.doneWhen)) c.add('doneWhen', 'The "done when" checks are missing.');
  else {
    const [min, max] = LIMITS.checks;
    if (doc.doneWhen.length < min || doc.doneWhen.length > max) c.add('doneWhen', `Give ${min} to ${max} checks.`);
    const seen = new Set();
    doc.doneWhen.forEach((check, i) => {
      const t = one(check);
      if (typeof check !== 'string' || t.length < LIMITS.check[0] || t.length > LIMITS.check[1]) {
        c.add(`doneWhen[${i}]`, `A check is text of ${LIMITS.check[0]} to ${LIMITS.check[1]} characters.`);
      } else if (seen.has(t.toLowerCase())) c.add(`doneWhen[${i}]`, 'This check is given twice.');
      seen.add(t.toLowerCase());
    });
  }

  if (doc.tools !== undefined) {
    if (!Array.isArray(doc.tools) || doc.tools.length > LIMITS.tools) c.add('tools', `Tools are a list of at most ${LIMITS.tools}.`);
    else doc.tools.forEach((t, i) => {
      const n = one(t).length;
      if (typeof t !== 'string' || n < LIMITS.tool[0] || n > LIMITS.tool[1]) c.add(`tools[${i}]`, 'A tool is a short name.');
    });
  }
  return c.errors;
}

const isHttpUrl = (v) => {
  if (typeof v !== 'string') return false;
  try { const u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
};
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
  && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/**
 * Validate a delivery. With `request`, also check the tie: the delivery
 * answers every "done when" check of that request, in order, and no others.
 */
function validateDelivery(doc, request) {
  const c = collector();
  if (!isObject(doc)) return [{ path: '', message: 'A delivery is an object.' }];
  c.unknown(doc, DELIVERY_KEYS);
  c.header(doc, 'delivery');
  c.text(doc, 'requestId', LIMITS.id, 'The request id', false);
  c.text(doc, 'title', LIMITS.title, 'The title');
  c.text(doc, 'whatItDoes', LIMITS.answer, 'What it does');
  c.text(doc, 'howToTry', LIMITS.answer, 'How to try it');
  c.text(doc, 'tested', LIMITS.answer, 'What was tested');
  c.text(doc, 'clientProvides', LIMITS.answer, 'What the client must provide');
  c.text(doc, 'notIncluded', LIMITS.answer, 'What is not included', false);
  c.text(doc, 'followOn', LIMITS.answer, 'The follow-on work', false);
  c.hours(doc, true);

  if (!Array.isArray(doc.checks)) c.add('checks', 'The answers to the "done when" checks are missing.');
  else {
    const [min, max] = LIMITS.checks;
    if (doc.checks.length < min || doc.checks.length > max) c.add('checks', `A delivery answers ${min} to ${max} checks.`);
    doc.checks.forEach((row, i) => {
      const at = `checks[${i}]`;
      if (!isObject(row)) { c.add(at, 'An answer is an object with check, result and evidence.'); return; }
      c.unknown(row, ['check', 'result', 'evidence'], `${at}.`);
      const t = one(row.check);
      if (typeof row.check !== 'string' || t.length < LIMITS.check[0] || t.length > LIMITS.check[1]) c.add(`${at}.check`, 'The check is missing or too short.');
      if (!RESULTS.includes(row.result)) c.add(`${at}.result`, `The result is one of: ${RESULTS.join(', ')}.`);
      const e = one(row.evidence).length;
      if (typeof row.evidence !== 'string' || e < LIMITS.evidence[0]) c.add(`${at}.evidence`, `Say what shows it, in at least ${LIMITS.evidence[0]} characters.`);
      else if (e > LIMITS.evidence[1]) c.add(`${at}.evidence`, `Keep the evidence under ${LIMITS.evidence[1]} characters.`);
    });
  }

  if (doc.links !== undefined) {
    if (!isObject(doc.links)) c.add('links', 'Links are an object with demo and code.');
    else {
      c.unknown(doc.links, ['demo', 'code'], 'links.');
      for (const k of ['demo', 'code']) if (doc.links[k] !== undefined && !isHttpUrl(doc.links[k])) c.add(`links.${k}`, 'A link is an http or https address.');
    }
  }

  if (doc.revision !== undefined) {
    const r = doc.revision;
    if (!isObject(r)) c.add('revision', 'A revision is an object with number and changes.');
    else {
      c.unknown(r, ['number', 'changes'], 'revision.');
      if (!Number.isInteger(r.number) || r.number < 1) c.add('revision.number', 'The revision number is a whole number from 1.');
      const n = one(r.changes).length;
      if (r.number > 1 && n < LIMITS.changes[0]) c.add('revision.changes', 'A revision after the first says what changed.');
      if (r.changes !== undefined && (typeof r.changes !== 'string' || n > LIMITS.changes[1])) c.add('revision.changes', `What changed is text of at most ${LIMITS.changes[1]} characters.`);
    }
  }

  if (doc.acceptance !== undefined) {
    const a = doc.acceptance;
    if (!isObject(a)) c.add('acceptance', 'Acceptance is an object with status, date and by.');
    else {
      c.unknown(a, ['status', 'date', 'by'], 'acceptance.');
      if (!ACCEPTANCE.includes(a.status)) c.add('acceptance.status', `The status is one of: ${ACCEPTANCE.join(', ')}.`);
      if (!isDate(a.date)) c.add('acceptance.date', 'The date is written YYYY-MM-DD.');
      if (!ACCEPTED_BY.includes(a.by)) c.add('acceptance.by', `Accepted by a role, one of: ${ACCEPTED_BY.join(', ')}. Never a name.`);
    }
  }

  if (request !== undefined) c.errors.push(...tieErrors(doc, request));
  return c.errors;
}

/** The tie: every check of the request is answered, in order, and no other. */
function tieErrors(delivery, request) {
  const errors = [];
  const asked = Array.isArray(request && request.doneWhen) ? request.doneWhen.map(one) : null;
  if (!asked) return [{ path: 'checks', message: 'The request has no "done when" checks to answer.' }];
  const answered = Array.isArray(delivery && delivery.checks) ? delivery.checks.map((r) => one(r && r.check)) : [];
  const norm = (s) => s.toLowerCase();
  asked.forEach((check, i) => {
    if (answered[i] !== undefined && norm(answered[i]) === norm(check)) return;
    const elsewhere = answered.findIndex((a) => norm(a) === norm(check));
    errors.push(elsewhere === -1
      ? { path: `checks[${i}]`, message: `The request's check ${i + 1} has no answer: "${check}"` }
      : { path: `checks[${elsewhere}]`, message: `The answers follow the order of the request; "${check}" is check ${i + 1}.` });
  });
  answered.forEach((check, i) => {
    if (!asked.some((a) => norm(a) === norm(check))) errors.push({ path: `checks[${i}]`, message: `This check is not in the request: "${check}"` });
  });
  if (request.id !== undefined && delivery.requestId !== undefined && one(request.id) !== one(delivery.requestId)) {
    errors.push({ path: 'requestId', message: 'The delivery names a different request.' });
  }
  return errors;
}

/** Validate either document. `options.request` ties a delivery to its request. */
function validate(doc, options = {}) {
  if (isObject(doc) && doc.kind === 'delivery') return validateDelivery(doc, options.request);
  if (isObject(doc) && doc.kind === 'request') return validateRequest(doc);
  return [{ path: 'kind', message: 'The kind must be "request" or "delivery".' }];
}

// ── The plain-text form ───────────────────────────────────────────────────
// One answer to a line, in a fixed order, so it reads in an email or a
// ticket and still parses back to the same document.

const REQUEST_LINES = [['id', 'Id'], ['title', 'Title'], ['audience', 'For'], ['build', 'Build'], ['data', 'Build it on'], ['handIn', 'Hand in']];
const DELIVERY_LINES = [['requestId', 'Request'], ['title', 'Title'], ['whatItDoes', 'What it does'], ['howToTry', 'How to try it'], ['tested', 'Tested'], ['clientProvides', 'The client must provide']];
const RESULT_LABEL = { met: 'met', partly: 'partly', not_met: 'not met' };

function render(doc) {
  const out = [];
  const line = (label, value) => { if (value !== undefined && one(String(value)) !== '') out.push(`${label}: ${one(String(value))}`); };
  if (isObject(doc) && doc.kind === 'request') {
    out.push(`Autoform request ${doc.autoform}`);
    for (const [key, label] of REQUEST_LINES) line(label, doc[key]);
    out.push('Done when:');
    for (const check of doc.doneWhen || []) out.push(`- ${one(check)}`);
    line('Hours', doc.hours);
    if (Array.isArray(doc.tools) && doc.tools.length) line('Suggested tools', doc.tools.map(one).join(', '));
    line('Follow-on', doc.followOn);
    return `${out.join('\n')}\n`;
  }
  if (isObject(doc) && doc.kind === 'delivery') {
    out.push(`Autoform delivery ${doc.autoform}`);
    for (const [key, label] of DELIVERY_LINES) line(label, doc[key]);
    out.push('Checks:');
    for (const row of doc.checks || []) {
      out.push(`- [${RESULT_LABEL[row.result] || row.result}] ${one(row.check)}`);
      out.push(`  Evidence: ${one(row.evidence)}`);
    }
    line('Not included', doc.notIncluded);
    line('Hours', doc.hours);
    line('Follow-on', doc.followOn);
    if (isObject(doc.links)) { line('Demo', doc.links.demo); line('Code', doc.links.code); }
    if (isObject(doc.revision)) { line('Revision', doc.revision.number); line('Changed', doc.revision.changes); }
    if (isObject(doc.acceptance)) line('Acceptance', `${doc.acceptance.status === 'accepted' ? 'accepted' : 'not accepted'}, ${doc.acceptance.date}, ${doc.acceptance.by}`);
    return `${out.join('\n')}\n`;
  }
  throw new TypeError('render needs a request or a delivery');
}

/** Read the plain-text form back into a document. Throws on a line it cannot place. */
function parse(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '');
  const head = /^Autoform (request|delivery) (\S+)$/.exec(lines[0] || '');
  if (!head) throw new SyntaxError('The first line is "Autoform request <version>" or "Autoform delivery <version>".');
  const kind = head[1];
  const doc = { autoform: head[2], kind };
  const labels = new Map((kind === 'request' ? REQUEST_LINES : DELIVERY_LINES).map(([key, label]) => [label, key]));
  const resultOf = { met: 'met', partly: 'partly', 'not met': 'not_met' };
  let list = null;
  for (let i = 1; i < lines.length; i += 1) {
    const l = lines[i];
    const fail = (why) => { throw new SyntaxError(`Line ${i + 1}: ${why}`); };
    if (l === 'Done when:' && kind === 'request') { doc.doneWhen = []; list = 'doneWhen'; continue; }
    if (l === 'Checks:' && kind === 'delivery') { doc.checks = []; list = 'checks'; continue; }
    if (list === 'doneWhen' && l.startsWith('- ')) { doc.doneWhen.push(l.slice(2).trim()); continue; }
    if (list === 'checks' && l.startsWith('- ')) {
      const m = /^- \[([^\]]+)\] (.+)$/.exec(l);
      if (!m) fail('a check is written "- [met] the check", with met, partly or not met.');
      doc.checks.push({ check: m[2].trim(), result: resultOf[m[1].trim()] || m[1].trim(), evidence: '' });
      continue;
    }
    if (list === 'checks' && /^\s+Evidence: /.test(l)) {
      if (!doc.checks.length) fail('evidence with no check above it.');
      doc.checks[doc.checks.length - 1].evidence = l.replace(/^\s+Evidence: /, '').trim();
      continue;
    }
    list = null;
    const at = l.indexOf(': ');
    if (at === -1) fail(`"${l}" is not "Label: value".`);
    const label = l.slice(0, at);
    const value = l.slice(at + 2).trim();
    if (labels.has(label)) doc[labels.get(label)] = value;
    else if (label === 'Hours') doc.hours = /^\d+(\.\d+)?$/.test(value) ? Number(value) : value;
    else if (label === 'Follow-on') doc.followOn = value;
    else if (label === 'Suggested tools' && kind === 'request') doc.tools = value.split(',').map((t) => t.trim()).filter(Boolean);
    else if (label === 'Not included' && kind === 'delivery') doc.notIncluded = value;
    else if ((label === 'Demo' || label === 'Code') && kind === 'delivery') doc.links = { ...(doc.links || {}), [label.toLowerCase()]: value };
    else if (label === 'Revision' && kind === 'delivery') doc.revision = { ...(doc.revision || {}), number: /^\d+$/.test(value) ? Number(value) : value };
    else if (label === 'Changed' && kind === 'delivery') doc.revision = { ...(doc.revision || {}), changes: value };
    else if (label === 'Acceptance' && kind === 'delivery') {
      const [status, date, by] = value.split(',').map((s) => s.trim());
      doc.acceptance = { status: status === 'accepted' ? 'accepted' : status === 'not accepted' ? 'not_accepted' : status, date, by };
    } else fail(`"${label}" is not a line of an Autoform ${kind}.`);
  }
  return doc;
}

module.exports = {
  VERSION, LIMITS, RESULTS, ACCEPTANCE, ACCEPTED_BY, REQUEST_KEYS, DELIVERY_KEYS,
  validate, validateRequest, validateDelivery, tieErrors, render, parse,
};
