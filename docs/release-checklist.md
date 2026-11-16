# Forge 0.10.0 release rehearsal checklist

Use a fresh checkout of the release candidate and a new project directory.
Record the commit, OS, Bun/Node/Python versions, browser and test date. These
unchecked boxes are acceptance work, not claims that the release has passed.
The package version is prepared as `0.10.0`; publication remains a separate step.

## Scope and prerequisites

- [ ] Review [release scope and issue mapping](roadmap.md); distinguish completed work from deferred features.
- [ ] Use the published MCPack 0.9.1 dependency; unset any `FORGE_MCPACK_CLI` override.
- [ ] Fresh `bun install --frozen-lockfile` succeeds; document any project-specific dependencies.
- [ ] Read the [developer guide](developer-guide.md) as a new user and follow its first-tool example.
- [ ] Record each finding with reproduction steps, expected/actual behavior and sanitized evidence.

## From-scratch project rehearsal

- [ ] Create a project; close, reopen, forget without deleting files, and open it again.
- [ ] Confirm project IDs remain stable when the folder is moved; recover a missing folder.
- [ ] Create Node and Python native tools, a static resource and a prompt.
- [ ] Edit definitions, full schemas and code. Test shared-worker bindings and helper modules with dependencies.
- [ ] Save and execute; verify new creation starts/discovers automatically.
- [ ] Edit code in an IDE, reload and confirm the implementation changes.
- [ ] Exercise a revision conflict and repair a malformed manifest/handler without losing saved work.
- [ ] Disable/enable capabilities; detach/reattach a source and confirm its files remain.

## Bridges and external sources

- [ ] Attach a Node adapter and Python adapter using the documented hook contract.
- [ ] Try same-project application code with `cwd`, then a separate checkout via `checkoutEnv`.
- [ ] Confirm adapter/app dependency ownership and Python interpreter selection.
- [ ] Attach an existing stdio MCP server without changing its implementation.
- [ ] Connect public and bearer-authenticated HTTP servers using variable names only.
- [ ] Fail/cancel a new connection; confirm the project was not left with an accidental saved source.
- [ ] Break a saved upstream; confirm healthy sources still work, then repair/reload it.
- [ ] Inspect empty and disabled bridges; verify management/reload remain reachable.
- [ ] Replay the [five-framework lab](../examples/bridges/compatibility-lab/README.md), including business errors and reload.

## Tester and named cases

- [ ] Verify form/JSON round trips, optional omission, nested arrays/objects and validation paths.
- [ ] Try a complex unsupported form schema in JSON; keep incomplete input without losing the draft.
- [ ] Populate sample input; verify replacement confirmation and handling when generation fails.
- [ ] Review structured/text/image previews and complete Raw JSON.
- [ ] Save success, expected tool-error and invalid-input cases with exact assertions.
- [ ] Make an assertion fail; inspect expected/actual values. Verify a transport error cannot pass as a tool error.
- [ ] Filter, select/deselect and batch-run cases across source types; stop after the active case.
- [ ] Change a schema or remove a tool; reconcile blocked cases and save again.
- [ ] Reopen the project; confirm definitions and local verdicts/timestamps persist appropriately.

## Agent exposure and MCP clients

- [ ] Hide/show a bridge/external tool, resource and prompt; override aliases/descriptions and restore defaults.
- [ ] Verify conflicting aliases are rejected without corrupting saved settings.
- [ ] Reconnect Inspector; confirm public discovery uses overrides and hidden direct calls are rejected.
- [ ] Confirm hidden upstream tools remain locally testable and their cases use original identities.
- [ ] Verify resource aliases preserve routing URIs and reads still succeed.
- [ ] Use a real host/IDE or the [agent example](../examples/agent/README.md) in addition to Inspector.
- [ ] Verify explicit-project stdio discovery/calls and clean protocol stdout.
- [ ] Close/switch projects; verify source cleanup, stale-result protection and no-active-project HTTP 503.

## Persistence, UX and diagnostics

- [ ] Restart Forge and resume from an existing tab, Projects and a fresh bookmark.
- [ ] Confirm filters, search, grouping and expanded groups survive navigation/refresh within a project/tab.
- [ ] Confirm another project's view preferences and execution history remain separate.
- [ ] Check execution history for workbench/agent tool calls, results and error details.
- [ ] In both themes and a narrow window, complete an edit and a test with
  Tab/Shift+Tab and Enter/Space. Open a path picker, use Escape to dismiss it,
  and check that focus returns to Browse. Expand a long description and check
  that controls remain visible and reachable.
- [ ] Inspect browser console for unexpected errors.

## Native deployment and Forge distribution

- [ ] Export a source with selected tools/resources/prompts and dynamic helpers/assets.
- [ ] Check original project files remain unchanged; disabled/excluded bindings are absent in the archive.
- [ ] Extract into a clean directory outside Forge; install dependencies and validate/start using its README.
- [ ] Invoke through HTTP and stdio without Forge running.
- [ ] Verify deployment variables, platform-specific interpreter paths and expected business errors.
- [ ] For a network listener, verify token/host/origin settings and TLS at the intended proxy.
- [ ] Build the candidate Docker image locally, start Compose and verify health, project mounts and persisted data.
- [ ] Exercise a native source and adapter in the container with Linux-installed dependencies.
- [ ] Verify the workbench port remains bound to host loopback.

## Automated gate on the final candidate

- [ ] Documentation links: `bun run check:docs`.
- [ ] Svelte/TypeScript, unit/integration, E2E and build: `bun run test:all`.
- [ ] Coverage: `bun run test:coverage`.
- [ ] Published runtime parity: `bun run test:mcpack`.
- [ ] Compatibility lab, native clean-install deployment and Chrome suites pass in the Multilanguage examples workflow.
- [ ] CI passes on Ubuntu, Windows and macOS; native deployment passes on Linux and Windows.
- [ ] Docker build and smoke checks pass; inspect uploaded browser screenshots.
- [ ] Perform manual project creation/runtime discovery/filesystem browsing on supported platforms. Record unavailable platforms as unverified.

`test:all` does not run coverage, lab, deployment or Chrome checks. See
[testing](testing.md) for those commands. Do not equate a green unit suite with
completed manual acceptance.

## Publication — only after acceptance

- [ ] Resolve release-blocking findings and rerun affected checks on the final commit.
- [ ] Confirm README, developer guide, changelog, package version, image examples and Compose version all agree on Forge 0.10.0.
- [ ] Keep MCPack pinned to its independently released 0.9.1; verify the frozen lockfile.
- [ ] Verify no secrets, local databases, personal recordings or implementation handoff documents are tracked.
- [ ] Record acceptance evidence and reconcile completed GitHub issues.
- [ ] Merge the release candidate into the intended release branch/main after maintainer review.
- [ ] Replace the changelog's preparation status with the actual publication date.
- [ ] Create tag `v0.10.0` on the reviewed commit and publish GitHub release notes.
- [ ] Verify release workflow provenance, `0.10.0`/`0.10` image tags and `latest` only for a non-prerelease publication.
- [ ] Fresh clone from the tag and fresh pull of the published image both work.

Preparation of this checklist does not create a tag, release or published image.
