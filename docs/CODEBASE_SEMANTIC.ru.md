# SelfReview P2 — Semantic TypeScript/React

P2 runs an opt-in bounded TypeScript Program and a source-backed internal import graph on explicitly selected source directories. It adds direct React-import hook placement checks, locally typed JSX props, architecture boundary policies and potential top-level invocation observations. It never runs target app code or project plugins.

## Windows PowerShell — BILLY

~~~powershell
$sr = 'C:\Users\levenskikh\Desktop\MyProjects\selfreview'
$billy = 'C:\Users\levenskikh\Desktop\billy'
$data = 'C:\Users\levenskikh\Desktop\selfreview-data\billy'
$cfg = Join-Path $data 'selfreview.config.json'
$project = 'billy'
$code = Join-Path $billy 'react-apps'
$tsconfig = Join-Path $billy 'tsconfig.json'
Set-Location $sr
git switch main
git pull --ff-only
npm.cmd ci --ignore-scripts
node .\bin\selfreview.mjs doctor --config $cfg

$scan = @('semantic','--config',$cfg,'--project',$project,'--code',$code,
  '--max-semantic-files','4000','--out',(Join-Path $data 'semantic.json'))
if (Test-Path $tsconfig) { $scan += @('--tsconfig',$tsconfig) }
node .\bin\selfreview.mjs @scan

$semantic = Get-Content (Join-Path $data 'semantic.json') -Raw | ConvertFrom-Json
$semantic.status
$semantic.coverage
$semantic.graph.unknown
$semantic.findings | Select-Object -First 30 path,startLine,semanticKind,message
~~~

If BILLY has separate TypeScript configs and React versions in different apps, perform independent bounded scans with the corresponding tsconfig. Never interpret one incomplete Program as the entire monorepo. Do not initialize a fresh config if an existing SelfReview catalog already holds project rules. Use the actual project ID from doctor.

## Diff-aware integration

~~~powershell
$review = @('review','--config',$cfg,'--project',$project,'--base','origin/main',
  '--merge-base','--semantic','--semantic-code',$code,'--max-semantic-files','4000',
  '--format','json','--out',(Join-Path $data 'review-semantic.json'))
if (Test-Path $tsconfig) { $review += @('--tsconfig',$tsconfig) }
node .\bin\selfreview.mjs @review
~~~

Replace origin/main with the real Git target ref. The static findings and the semantic findings are reported separately; a changed-node intersection is not proof of a newly introduced semantic violation. Staged semantic review and new-only semantic review explicitly report INCOMPLETE until an exact index / base semantic snapshot can be compared.

## Optional source-backed architecture profile

A profile does not itself approve any rule. Each entry must cite an already approved manual SelfReview catalog rule AND pinned source evidence with a SHA-256 digest. Use --semantic-profile PATH to opt in. Example below uses placeholders; no such policy is assumed for BILLY.

~~~json
{
  "schemaVersion": 1,
  "project": "billy",
  "boundaryRules": [
    {
      "ruleId": "EXISTING_APPROVED_MANUAL_RULE",
      "from": "react-apps/new-ui/**/*",
      "to": "react-apps/legacy-ui/**/*",
      "includeTypeOnly": false,
      "evidence": {
        "path": "docs/approved-architecture.md",
        "sha256": "REPLACE_WITH_REAL_LOWERCASE_SHA256"
      }
    }
  ],
  "topLevelRules": []
}
~~~

topLevelRules can encode a separately confirmed ban on top-level call expressions in matching modules. The list of invocations itself is advisory, not proof of all runtime side effects. The AST miner is useful for finding proposals, not for deriving automatically approved team conventions.

## Boundaries

- No network calls, app execution, target dependency installs, or credential changes are performed by SelfReview.
- TypeChecker is bounded by explicitly selected roots, TypeScript declarations available locally and optional tsconfig. Unresolved internal dependencies and type diagnostic errors produce explicit coverage gaps.
- React hook checks are limited to directly imported react symbols. A re-exported hook or complex flow may remain UNKNOWN; shadowed identifiers are not conflated with React.
- JSX props checking is limited to static local function signatures; spread, generic and index-signature cases are not treated as proven errors.
- Module cycles and top-level invocations are observations, not automatic prohibitions.
- Missing inputs, parse errors, source byte drift, or caps produce INCOMPLETE, not a clean PASS.
- Never publish private BILLY paths, source excerpts or report files in public SelfReview CI artifacts.
