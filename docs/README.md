# docs

Project documentation lives here.

Directory conventions:

- `specs/` — normative and semi-normative design specs
- `rfcs/` — numbered RFCs for later governance and migration proposals
- `ops/` — operational guides

Current specs and reports:

- `specs/forge-v1.md` — T004 `.forge` v1 specification seed
- `specs/issue-intake.md` — T015 issue intake classifier specification
- `specs/t003-validation-fixture.yaml` — T003 constitution/mind assertions
- `specs/t004-validation-report.md` — T004 schema fixture result summary
- `specs/t005-validation-report.md` — T005 parser/hash validation summary
- `specs/t006-validation-report.md` — T006 GitHub App manifest validation summary
- `specs/t007-validation-report.md` — T007 webhook ingest validation summary
- `specs/t008-validation-report.md` — T008 event inbox/idempotency validation summary
- `specs/t014-validation-report.md` — T014 runtime mode and kill switch validation summary
- `specs/t015-validation-report.md` — T015 intake classifier validation summary

Operational notes:

- `ops/event-inbox.md` — T008 event inbox status model and replay boundary
- `ops/runtime-mode.md` — T014 runtime mode, kill switch, quarantine/halted, restore, and 403/429 downgrade behavior
