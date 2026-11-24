# Frontend Conventions

[Русский](README.ru.md)

A standalone JS/TS/React review pack. It contains a shared detector registry, a diff-aware CLI, an ESLint adapter, a manual checklist, and a runnable synthetic matrix. Choose a project explicitly before applying the pack. Project documentation and native checks decide applicability and local exceptions.

[Manual review scenarios and expected outcomes](../../examples/conventions/review-scenarios.json)

## Restore from a clone

From the SelfReview repository root, use Node.js 22.13+ and Git.

```text
cd packs/frontend-conventions
npm ci --ignore-scripts --registry https://registry.npmjs.org
npm test
node dist/auditor/src/cli.js rules
```

Copy [the skill](skills/frontend-conventions/SKILL.md) into `frontend-conventions/SKILL.md` under your Codex or OpenCode user skills directory. Set `FRONTEND_CONVENTIONS_ROOT` to the absolute path of this pack in your clone so the installed skill can find its built CLI.

For a real project, copy [the example profile](profile.example.json) into a local ignored directory such as `.selfreview/frontend-conventions/profile.json` at the SelfReview root. Replace fictional values with the following bindings from the target checkout and set `FRONTEND_CONVENTIONS_PROFILE` to that file's absolute path.

| Field | Where to get it |
| --- | --- |
| `targetApp` | Repo-relative source directory of the workspace where the local hook placement and layout rules apply. |
| `appUi`, `legacyUi` | Modern project UI library and legacy UI library package names from workspace manifests/imports. |
| `reactUi`, `icons`, `typography` | Component, icon and typography package names from the project's imports. |
| `dateImplementation` | Repo-relative directory of the approved date wrapper implementation. |
| `sharedUiDirectory` | Directory segment for the shared UI source, where SVG and local-state rules have exceptions. |
| `configFile`, `disableDirective` | Existing review configuration filename and inline suppression token to preserve project exceptions. |

Supply the same profile to the CLI and ESLint. With no profile, the pack uses the sample names to run the matrix. For actual review, pass the checkout and both refs explicitly.

```text
node dist/auditor/src/cli.js check --repo <project> --base <base> --head <head> --format json --strict
```

Exit 0 means no blocking finding. Exit 1 signals a blocking finding or a MUST under strict mode, and exit 2 signals incomplete analysis in strict mode. Read the JSON diagnostics, verify the snapshot, and complete the applicable manual checks. [Registry and checklist](core/src/registry.ts)

Add `--duplicates` to report matching TS/TSX function implementations within the files selected by the diff. The check ignores formatting, comments and outer function names. It skips short bodies, test files and usual generated directories, and requires at least one changed body. Candidates are informational, including in strict mode. Compare callers and contracts before extracting shared code. Unchanged files outside the diff and similar bodies that rename variables or change operations require manual review.

## Matrix

Each row in [the synthetic matrix](checks/matrix.json) holds a rule, an authored snippet, an expected outcome and any required path or diff context. `npm test` asserts coverage for every active rule, compares findings from both entry points where supported, and checks Git snapshots and profile scope using a temporary fictional repository. Two cases record decisions requiring human review. The fixture source is parsed without execution.

Keep project-specific profiles, original discussions, evidence, and real review reports in local ignored storage when extending this pack.
