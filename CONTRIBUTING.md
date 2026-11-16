# Contributing

Use the [developer guide](docs/developer-guide.md) to understand the workflow.
For a defect, include the tested commit/version, OS/runtime versions, source kind,
minimal synthetic project and steps with expected/actual behavior. Screenshots
are useful after removing private paths, tokens and business data.

## Development

Target the active integration branch (`v0.10.0` during its rehearsal). Keep a PR
focused and describe behavior and validation. Do not commit local databases,
installed dependencies, credentials or implementation-session transcripts.

```sh
bun install --frozen-lockfile
bun run check:docs
bun run check
bun run test
bun run test:e2e
bun run test:mcpack
bun run build
```

Python bridge E2E checks require the tested Python MCP SDK. See
[testing](docs/testing.md) and [CI](docs/ci.md) for the full environment and separate
browser, compatibility-lab and clean-deployment suites. `test:all` is the normal
local gate, not a substitute for those additional release checks.

Use temporary projects/databases in tests. Preserve existing projects and source
ownership. Adapter/dependency changes must not rewrite connected applications.
Use public framework interfaces, preserve MCP result semantics and propagate
cancellation where the framework permits it. Do not mask failures by weakening
assertions or indiscriminately increasing timeouts.

For UI changes, check both themes, keyboard operation, a narrow viewport and
navigation/reload behavior. For docs, keep examples aligned with schemas and
source code, use relative repository links and run the link checker. Screenshots
should show synthetic projects from the matching implementation.

The maintainer completes [release acceptance](docs/release-checklist.md) before
merging the release to main, tagging or publishing. A preparation PR must not
publish images or create a release.
