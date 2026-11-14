#!/usr/bin/env node
'use strict';
const fs = require('fs');
const lib = require('../lib');

const HELP = `autoform: check and convert Autoform requests and deliveries

Usage
  autoform validate <file> [--request <file>]   check a request or a delivery;
                                                with --request, also check that the
                                                delivery answers every check of it
  autoform render <file.json>                   print the plain-text form
  autoform parse <file.txt>                     print the JSON form

A file ending in .json is read as JSON; anything else as the plain-text form.
Exit status: 0 valid, 1 not valid, 2 bad usage or unreadable file.
`;

function fail(message) {
  process.stderr.write(`autoform: ${message}\n`);
  process.exit(2);
}

function load(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (err) {
    fail(err.code === 'ENOENT' ? `${file} not found` : `cannot read ${file}: ${err.message}`);
  }
  try { return file.endsWith('.json') ? JSON.parse(raw) : lib.parse(raw); } catch (err) {
    return fail(`${file}: ${err.message}`);
  }
}

function main(argv) {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) { process.stdout.write(HELP); return argv.length ? 0 : 2; }
  const [command, ...rest] = argv;
  const files = [];
  let requestFile;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--request') {
      if (i + 1 >= rest.length) fail('--request needs a file');
      requestFile = rest[i += 1];
    } else if (rest[i].startsWith('-')) fail(`unknown option ${rest[i]}`);
    else files.push(rest[i]);
  }
  if (files.length !== 1) fail(`${command || 'the command'} takes one file`);
  const doc = load(files[0]);

  if (command === 'render') {
    try { process.stdout.write(lib.render(doc)); } catch (err) { fail(err.message); }
    return 0;
  }
  if (command === 'parse') { process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`); return 0; }
  if (command !== 'validate') fail(`unknown command ${command}`);

  let request;
  if (requestFile) {
    request = load(requestFile);
    const problems = lib.validateRequest(request);
    if (problems.length) {
      process.stdout.write(`${requestFile} is not a valid request:\n`);
      for (const e of problems) process.stdout.write(`  ${e.path || '(document)'}: ${e.message}\n`);
      return 1;
    }
    if (!doc || doc.kind !== 'delivery') fail('--request goes with a delivery');
  }
  const errors = lib.validate(doc, { request });
  if (!errors.length) {
    process.stdout.write(`${files[0]}: a valid Autoform ${doc.kind}${request ? ', and it answers every check of the request' : ''}.\n`);
    return 0;
  }
  process.stdout.write(`${files[0]}: ${errors.length} problem${errors.length === 1 ? '' : 's'}\n`);
  for (const e of errors) process.stdout.write(`  ${e.path || '(document)'}: ${e.message}\n`);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
