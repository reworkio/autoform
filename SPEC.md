# Autoform 0.1

Autoform is a format for handing over a piece of automation work. It has two documents:

- a **request**: what to build, for whom, on what data, and the checks that say it is done;
- a **delivery**: what was built, how to try it, what was tested, what the client must provide, and an answer to every check of the request.

Each document has a JSON form and a plain-text form that carry the same content.

## Scope

Autoform describes one piece of work at the moment it changes hands. It does not describe a project: no stages, schedule, order of work or status. A job delivered in stages is several Autoform documents, one request and one delivery per stage.

Autoform carries no price, no named client and no information about the platform or process the work went through. A document with a field not listed here is not valid.

## Text

Every text field is read as one line: runs of whitespace, line breaks included, count as a single space, and leading and trailing space is ignored. Lengths below are counted after that.

## Request

| Field | Required | Type | Meaning |
|---|---|---|---|
| `autoform` | yes | `"0.1"` | The version of this specification |
| `kind` | yes | `"request"` | |
| `id` | no | text, 1 to 120 | A name the delivery can point at |
| `title` | yes | text, 8 to 120 | |
| `audience` | yes | text, 20 to 2000 | Who it is for and the problem they have. A kind of client, never a named one |
| `build` | yes | text, 40 to 2000 | What to build |
| `data` | yes | text, 20 to 2000 | What to build and test it on |
| `handIn` | yes | text, 20 to 2000 | What to hand in |
| `doneWhen` | yes | 2 to 5 texts, each 5 to 300, no two the same | The checks that say it is done |
| `hours` | no | whole number, 1 to 2000 | The effort expected |
| `tools` | no | up to 20 short names | Suggested tools |
| `followOn` | no | text, 20 to 2000 | The larger piece of work this one leads to |

A check is a statement that can be seen to be true or not: "A duplicate invoice is flagged and not entered twice", not "Handles duplicates well".

## Delivery

| Field | Required | Type | Meaning |
|---|---|---|---|
| `autoform` | yes | `"0.1"` | |
| `kind` | yes | `"delivery"` | |
| `requestId` | no | text, 1 to 120 | The `id` of the request this answers |
| `title` | yes | text, 8 to 120 | |
| `whatItDoes` | yes | text, 20 to 2000 | What it does, for someone who has not seen it |
| `howToTry` | yes | text, 20 to 2000 | The link, any test login, and the steps to see it work |
| `tested` | yes | text, 20 to 2000 | What it was tested on, and the result |
| `clientProvides` | yes | text, 20 to 2000 | The accounts, access and data the client must provide to run it |
| `checks` | yes | 2 to 5 answers | See below |
| `notIncluded` | no | text, 20 to 2000 | What it does not do |
| `hours` | yes | number, 1 to 2000 | The effort it took |
| `followOn` | no | text, 20 to 2000 | What a larger piece of work would add |
| `links` | no | `demo`, `code`: web addresses | Evidence |
| `revision` | no | `number` (whole, from 1), `changes` (text, 10 to 1000) | Which delivery this is. `changes` is required when `number` is above 1 |
| `acceptance` | no | `status`, `date`, `by` | Whether it was accepted. See below |

### Answers to the checks

Each entry of `checks` has three fields, all required:

| Field | Type | Meaning |
|---|---|---|
| `check` | text | The check, as the request words it |
| `result` | `met`, `partly` or `not_met` | |
| `evidence` | text, 10 to 1000 | What shows the result: a count, a place in the demo, a file |

**The tie.** A delivery answers every check of its request, in the request's order, and answers no check the request does not have. Checks are compared after the text rule above and without regard to letter case. This is the one rule the JSON Schemas cannot hold, because it spans two documents; a validator must check it when it is given both.

A delivery may honestly report `partly` or `not_met`. A delivery that reports them is valid; one that leaves a check out is not.

### Acceptance

| Field | Type | Meaning |
|---|---|---|
| `status` | `accepted` or `not_accepted` | |
| `date` | `YYYY-MM-DD` | |
| `by` | `client` or `reviewer` | A role, never a name |

## Plain-text form

The first line names the document and version. After it, one field to a line as `Label: value`, in the order below. Optional fields that are absent are left out. Blank lines are ignored.

Request:

```
Autoform request 0.1
Id: …
Title: …
For: …
Build: …
Build it on: …
Hand in: …
Done when:
- first check
- second check
Hours: 8
Suggested tools: one, two
Follow-on: …
```

Delivery:

```
Autoform delivery 0.1
Request: …
Title: …
What it does: …
How to try it: …
Tested: …
The client must provide: …
Checks:
- [met] first check
  Evidence: …
- [not met] second check
  Evidence: …
Not included: …
Hours: 7.5
Follow-on: …
Demo: https://…
Code: https://…
Revision: 2
Changed: …
Acceptance: accepted, 2026-01-05, client
```

In the text form the results are written `met`, `partly` and `not met`, and acceptance `accepted` or `not accepted`.

## Versions

The `autoform` field names the version a document was written to. Until 1.0, a new version may change fields; from 1.0, a document valid under 1.x stays valid under every later 1.x.
