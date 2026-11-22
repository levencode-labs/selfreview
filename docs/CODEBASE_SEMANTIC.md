# P2: semantic TypeScript review

P2 extends the read-only AST miner with an opt-in TypeScript Program, internal import graph and carefully bounded React hook, JSX property and architectural analyses.

## Commands

~~~sh
node bin/selfreview.mjs semantic --config CONFIG --project PROJECT --code SOURCE_ROOT --out semantic.json
node bin/selfreview.mjs review --config CONFIG --project PROJECT --base GIT_BASE --merge-base --semantic --semantic-code SOURCE_ROOT --format json --out review.json
~~~

Optionally pass --tsconfig PROJECT_TSCONFIG and --semantic-profile PROFILE_JSON. For exact Windows BILLY paths, a source-backed profile example and boundaries see [the Russian walkthrough](CODEBASE_SEMANTIC.ru.md).

Architectural enforcement requires an existing approved manual rule in the catalog and SHA-256 pinned project evidence. The frequent motifs discovered by mine are never automatically approved. Side-effect indicators and module cycles are advisory. Unresolvable imports, type diagnostics, source drift or truncated coverage yield INCOMPLETE. Diff intersection is not proven newly introduced semantics. Staged/new-only semantic snapshots are explicitly unsupported and return INCOMPLETE.

Target project modules, compiler plugins and build scripts are not executed, and no credentials, dependencies or global settings are changed. A true pilot on BILLY with pinned SHA and independent labeled negatives is still required.
