# Named tool test cases

Save tool inputs and expected results as repeatable regression checks. Cases
work with native, bridged and external tools. They do not currently cover
resources, prompts or legacy Forge Tool ABI tools.

## Create and edit a case

1. Open a tool's **Test** or **Inspect & test** view. Prepare arguments using the
   form or JSON editor. Run once if you want to capture a known expected result.
2. Expand **Named test cases** and choose **Save as case**. Enter a name unique
   for this tool/source, review the saved arguments and choose the expectation.
3. For success or a tool error, add exact-value assertions. **Use value from last
   result** captures the value at your chosen JSON Pointer. Review that value:
   capturing the current result alone does not prove the implementation correct.
4. Save, select the case and run it. Failed rows show expected and actual values.
   Edit a case in its tool tester; deleting a case does not delete the tool.

| Expected mode | Passing condition | Calls the handler? |
| --- | --- | --- |
| Success | MCP result without `isError: true`, and every assertion matches | Yes |
| Tool error | MCP result with `isError: true`, and every assertion matches | Yes |
| Invalid input | Local schema validation reports the exact expected path | No |

Transport, authentication and process failures fail the case even when it
expects a tool error. Invalid-input cases require local validation support.
They test the tester's validation, not the upstream server's rejection behavior.

## Assertions and JSON Pointer

Assertions use deep exact equality, including types. `"59.93"` is different
from `59.93`. An assertion on an object checks that entire object; an assertion
on an array checks its complete order and contents. An absent path fails.

| Pointer | Meaning |
| --- | --- |
| `/structuredContent/total` | The `total` field of structured content |
| `/content/0/text` | Text of the first MCP content item |
| `/structuredContent/a~1b` | A property literally named `a/b` |
| `/structuredContent/a~0b` | A property literally named `a~b` |
| Empty string | The complete result |

For the [native quote example](../examples/bridges/compatibility-lab/README.md),
use `{"sku":"ACT-42","quantity":3,"tier":"premium"}` and assert
`/structuredContent/total` is `"59.93"`. A quantity of 21 exceeds its seeded
stock and can assert `INSUFFICIENT_STOCK` at `/structuredContent/code` in
**Tool error** mode. A quantity of 0 can expect local validation at `/quantity`.

Prefer stable fields over a whole response containing timestamps, generated
IDs or changing remote data. There are no regex, tolerance, snapshot-update,
setup/teardown or mocked-response assertion modes in this release.

## Project-wide runs

Open **Workspace → Named test cases**. Search by case, tool or source; filter
by source type, source and result. Filters persist per project in the current
browser tab. **Select all visible** selects runnable cases matching those
filters. Hidden-by-filter cases are not run. **Deselect all** clears selection.

**Run selected** runs sequentially in list order. Live calls requiring confirmation
are confirmed once for the batch. **Stop after current case** stops the remaining
queue without cancelling the active handler. No automatic retries or rollback
are performed. Use fixtures designed for repeated execution; real tools can
write to databases, incur costs or send messages.

## Identity, drift and persistence

`forge.cases.json` contains versioned definitions, UUIDs and input-schema hashes.
Save cases through the UI so Forge generates those values. Commit the file next
to `forge.project.json`. It permits up to 500 cases and 1 MiB in total, with up
to 48 exact-value assertions in a case.

Cases target the source ID, source kind and original tool identity. Public
aliases do not retarget cases. Hidden bridge/external tools remain testable
locally. Missing tools, disabled/unavailable sources and changed input schemas
are reported for review. After a schema change, open the tester, reconcile the
arguments/assertions and save again before running. Do not blindly rewrite a
schema hash to suppress the warning.

File revisions protect concurrent edits. Project switches and source reloads
invalidate stale runs. Last-run verdicts/timestamps are stored in local SQLite
and do not travel with the case file. Changing a definition invalidates its
saved verdict. A pass is evidence for those inputs and that run, not a promise
that an external server or its data has remained unchanged.

Native deployment archives exclude cases. There is no supported headless CLI
for running saved cases in CI yet. Forge's own automated compatibility tests
are separate; see [testing](testing.md).
