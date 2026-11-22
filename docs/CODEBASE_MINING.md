# Mine a React / TypeScript monorepo into SelfReview knowledge

This is **source-derived evidence**, not automatic policy. The miner traverses the selected JS/TS/JSX/TSX source tree without running it, resolves import bindings only within each file and finds AST motifs that recur across distinct files. It never downloads dependencies, imports target modules, calls an AI API or approves rules.

Motifs currently include: external import sources, imported React hooks, useEffect dependency-array forms, imported JSX components and explicitly named props, component declaration styles, top-level export styles and statically imported function-call shapes. The first directory under each selected --code root is reported as an observational group (not an inferred business application).

## Windows PowerShell — first use

Use **Node 22.13+**, a local SelfReview checkout and the pinned dependencies. Replace the sample paths. Keeping configuration and reports outside bily avoids writing generated files to your target repository.

~~~powershell
Set-Location 'C:\Repos\selfreview'
npm.cmd ci --ignore-scripts

# Run once ONLY when you have no SelfReview config/catalog for bily:
New-Item -ItemType Directory -Force 'C:\Repos\review-data\bily' | Out-Null
node .\bin\selfreview.mjs init --config 'C:\Repos\review-data\bily\selfreview.config.json' --scope bily-web --project 'C:\Repos\bily'
node .\bin\selfreview.mjs doctor --config 'C:\Repos\review-data\bily\selfreview.config.json'

# Read-only, deterministic exploration. Do not change the catalog:
node .\bin\selfreview.mjs mine --config 'C:\Repos\review-data\bily\selfreview.config.json' --project bily --code 'C:\Repos\bily\react-apps' --min-files 3 --max-files 20000 --max-patterns 80 --out 'C:\Repos\review-data\bily\react-apps.mine.json'
$mining = Get-Content 'C:\Repos\review-data\bily\react-apps.mine.json' -Raw | ConvertFrom-Json
$mining.status
$mining.coverage
$mining.patterns | Select-Object -First 25 kind,value,distinctFiles,occurrences
~~~

If an **existing** config/catalog is present, **skip init**. Use its existing --config and actual project ID shown by doctor. Do not overwrite old rules. The --code root must be within the registered project directory. You may repeat --code for multiple **nonoverlapping** folders.

The default cap is 20,000 eligible files and 2 MiB per file; a real limit, unreadable/invalid UTF-8, parse error or non-excluded symlink makes status INCOMPLETE and exit code 2. Increase --max-files up to 100,000 as needed; never equate a truncated result with a full scan. Explicitly exclude vendor/generated source by updating your project config's exclude globs; do not ignore failures for convenience. Max 200 patterns are returned, and patternsOmittedByLimit exposes truncation of the ranking.

## Enrich the existing catalog (without auto-approval)

First inspect the report's groups, sample paths, and exceptions. Then rerun the same scan with --enrich; it commits **candidate/manual/advisory** entries through the catalog's existing lifecycle while retaining approved/rejected decisions and old evidence.

~~~powershell
node .\bin\selfreview.mjs mine --config 'C:\Repos\review-data\bily\selfreview.config.json' --project bily --code 'C:\Repos\bily\react-apps' --min-files 3 --max-files 20000 --max-patterns 80 --enrich --out 'C:\Repos\review-data\bily\react-apps.enriched.json'
node .\bin\selfreview.mjs rules list --config 'C:\Repos\review-data\bily\selfreview.config.json' --scope bily-web
~~~

Open interesting rule IDs using rules show, check conflicting examples in other apps and use rules preview --project bily. **Approve only if an engineer has established the convention**, not because the motif is common. A mined manual rule cannot become a deterministic AST error merely by approval. Implement a separate typed/diff-aware checker with negative controls for that.

If no motifs meet --min-files, the report remains valid with NO_REPEATED_PATTERNS; try --min-files 2 to explore before drawing conclusions. Repeating --enrich on the same snapshot merges evidence by logical identity rather than duplicating decisions.

## Give the Skill actual observed patterns

From the **same pinned source revision**, generate a diff-bound agent pack with an opt-in knowledge snapshot. Use the real Git base (for example origin/main) for the target checkout:

~~~powershell
node .\bin\selfreview.mjs agent-pack --config 'C:\Repos\review-data\bily\selfreview.config.json' --project bily --base origin/main --knowledge 'C:\Repos\review-data\bily\react-apps.mine.json' --out 'C:\Repos\review-data\bily\agent-pack.json'
node .\bin\selfreview.mjs export --config 'C:\Repos\review-data\bily\selfreview.config.json' --scope bily-web --project bily --out 'C:\Repos\review-data\bily\skill-export-v1'
~~~

Copy the exported selfreview-bily-web Skill folder to the supported skill directory of Codex/OpenCode, or feed agent-pack.json as task context. The pack retains approvedRules separately from candidateQuestions and minedKnowledge. **minedKnowledge is observational and NOT revalidated at import time**: re-run mine after the target revision changes, and review exact file-specific applicability. The exported Skill itself never grants permissions or acts on source examples as instructions.

## Boundaries and safety

- Project code is parsed but not executed, installed or imported. No model calls or credentials are needed.
- Imported bindings are resolved only from current-file import syntax. Calls and JSX props have **no cross-file types, behavior, alias-flow, data-flow, router graph or side-effect guarantees**.
- Patterns are ranked by the number of distinct source files; a popular anti-pattern is still an anti-pattern.
- A group is the first-level folder beneath a --code root, not proof that all folders share conventions. Split incompatible app families into scopes before approving global policy.
- Reports and catalogs may disclose private module names, file paths and hashes. Keep them local/private; do not attach a private bily report to a public SelfReview PR.
- A parse/scan gap blocks --enrich. The maximum number of ranked motifs and example count are also bounded and visible.
- Existing policy remains unchanged unless --enrich is explicitly provided. Existing confirmed rules never get auto-approved, rejected or rewritten by the miner.

Next step for a true high-signal automatic review is to freeze a representative set of historical unseen diffs, label violations independently and implement a small number of semantic checkers backed by negative controls. This miner supplies the candidate shortlist and evidence, not a fabricated false-positive rate.
