# Autoform

An open format for handing over automation work: one **request**, and one **delivery** that answers it.

A delivery in Autoform tells the person receiving the work what was built, how to try it, what was tested, what they must provide to run it, and whether each thing they asked for was met, with the evidence.

## What you get

- **A fixed shape for a request:** who it is for, what to build, the data to build it on, what to hand in, and 2 to 5 "done when" checks.
- **A fixed shape for a delivery:** what it does, how to try it, what was tested, what the client must provide, and the hours it took.
- **Every check answered.** A delivery answers each check of its request, in order, as met, partly or not met, with what shows it. A tool can tell you which check was skipped.
- **Two forms, same content:** JSON for software, and a plain-text form that reads fine in an email or a ticket.
- **A validator, JSON Schemas and a command-line tool.** No runtime dependencies. Node 18 or later.

Autoform describes one piece of work at the moment it changes hands. It is not a project format: it has no stages or schedule. It carries no price and no named client.

## What it looks like

A delivery in the plain-text form ([full example](examples/delivery.txt), [its request](examples/request.txt)):

```
Autoform delivery 0.1
Request: invoice-intake-01
Title: Invoice intake for a bookkeeping firm
What it does: Watches a folder for supplier invoices, reads each PDF and adds one row per invoice to a spreadsheet, so nobody retypes them.
How to try it: Open the demo sheet, drop any PDF from the samples folder into the inbox folder and wait about a minute for its row to appear.
Tested: Ran all 50 sample invoices twice. 49 were read fully and one scanned invoice was sent to the review list.
The client must provide: A mailbox or folder where invoices arrive, edit access to their spreadsheet, and ten real invoices to tune the reading.
Checks:
- [partly] All 50 sample invoices are read into the sheet
  Evidence: 49 of 50 rows are in the sheet; the scanned invoice went to the review list instead.
- [met] A duplicate invoice is flagged and not entered twice
  Evidence: All three duplicates are marked in the Duplicate column, shown in the demo at 1:20.
- [met] An invoice that cannot be read is listed for a person to check
  Evidence: The scanned invoice appears on the Review tab with its file name and the reason.
Hours: 7.5
```

The same documents as JSON: [request](examples/request.json), [delivery](examples/delivery.json). Every field is defined in [SPEC.md](SPEC.md).

## Use

### Command line

```bash
# Is this a valid request or delivery?
npx github:reworkio/autoform validate delivery.json

# Does the delivery answer every check of its request?
npx github:reworkio/autoform validate delivery.json --request request.json

# Convert between the forms
npx github:reworkio/autoform render delivery.json    # JSON to text
npx github:reworkio/autoform parse delivery.txt      # text to JSON
```

A file ending in `.json` is read as JSON, anything else as the plain-text form. When something is wrong it says where:

```
delivery.json: 1 problem
  checks[2]: The request's check 3 has no answer: "An invoice that cannot be read is listed for a person to check"
```

Exit status is `0` when valid, `1` when not, and `2` for bad usage or an unreadable file.

### As a library

```bash
npm install github:reworkio/autoform
```

```js
const autoform = require('@reworkio/autoform');

const errors = autoform.validate(delivery, { request });
// [] when valid, otherwise [{ path: 'checks[2]', message: '…' }]

const text = autoform.render(delivery);   // the plain-text form
const doc = autoform.parse(text);         // back to the document
```

### JSON Schemas

[`schema/request.schema.json`](schema/request.schema.json) and [`schema/delivery.schema.json`](schema/delivery.schema.json) (draft 2020-12) work with any JSON Schema validator, in any language. They check each document by itself. The rule that a delivery answers every check of its request spans two documents, so a schema cannot hold it; use the validator here or implement the rule from [SPEC.md](SPEC.md).

## Who it is for

- **People who build automations:** you know what a complete delivery is before you start, and can check it before you send it.
- **People who commission them:** every delivery answers the same questions in the same order, so two can be compared, and you can see at a glance which of your checks passed.
- **Tools and marketplaces:** one definition to store, validate and exchange.

## Status

Version 0.1. Fields may change before 1.0; the `autoform` field in each document says which version it was written to. Proposals and questions are welcome as issues.

## Licence

MIT
