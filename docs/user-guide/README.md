# User guide — source

The client-facing guide. **This folder is the source; the `.docx` is built from it.**

    npm run docs:guide      # -> Inventory-Management-User-Guide.docx

Built by `scripts/generate-user-guide.ts`. The `.docx` is generated and
gitignored — never edit it directly, the next build overwrites it.

## Why it is not authored in Word

The application changes. A Word file edited by hand goes stale within a release
and nobody diffs it in review. Keeping the source here means the guide is
version-controlled, reviewable in a pull request alongside the change that made
it wrong, and regenerated on demand. Same arrangement as the master-data
workbook: `docs/master-data-upload.md` is the spec and
`scripts/generate-master-data-template.ts` is its executable half.

## Who it is for

The **client's own staff**, at three levels, with no overlap between them:

| Part | Audience | Assumed knowledge |
|---|---|---|
| 1 | everyone | none |
| 2 | growers — field and packhouse staff | Part 1 |
| 3 | vendors | Part 1 |
| 4 | the client's administrators | Parts 1–3 |
| 5 | reference, all audiences | — |

Parts 2 and 3 must stay printable on their own, so a grower can be handed those
pages without the administration chapters. Nothing in Part 2 may depend on
having read Part 4.

The client administers the system themselves, so Part 4 states the CONSEQUENCE
of every action that is hard to undo — deactivating a user, renaming a category,
deleting an item — rather than assuming an operator who already knows.

## House rules

- **Reference, not tutorial.** The client is given a live demo; this document is
  what they open eighteen months later. Favour tables, stable headings and
  findability over narrative.
- **Every form gets a field table**, in one fixed shape:
  `Field | Required | What to enter | Notes`.
- **Allowed values come from `lib/constants.ts`**, never retyped. Statuses,
  roles, application methods and location types are generated into the document
  so it cannot describe a value the application would reject.
- **No implementation detail.** No table names, file paths, environment
  variables or API routes. That is `TECHNICAL-DOCUMENTATION.md`, and the two
  documents must not overlap.
- **Say what the screen says.** Where a label is confusing, explain it rather
  than quietly using a better word — a reader looking at "Approved" needs to
  find "Approved".
- **English only.** The application itself is bilingual (English/Spanish) and
  that is documented as a feature, but the guide is not translated.

## Out of scope

- The one-time master-data workbook load. It happens once at go-live and is
  covered by `docs/master-data-upload.md`.
- Anything infrastructural: deployment, database, backups, monitoring.

## Screenshots

`images/`, taken from seeded demo data only — never a real client environment,
so no genuine grower or vendor names travel with the document. Keep them few:
the submission screen, the item dialog, mappings, thresholds. Prose must make
sense with the images removed.
