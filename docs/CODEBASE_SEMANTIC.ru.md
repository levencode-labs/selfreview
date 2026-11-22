# SelfReview P2 — Semantic TypeScript/React

## Самый простой запуск: одна команда

В обычном PowerShell на Windows **после принятия P2 в main**:

~~~powershell
Set-Location 'C:\Users\levenskikh\Desktop\MyProjects\selfreview'
npm.cmd ci --ignore-scripts
node .\bin\selfreview.mjs quickstart --project-path 'C:\Users\levenskikh\Desktop\billy'
~~~

SelfReview рекурсивно найдёт все доступные \`package.json\` вне директорий сборки, отберёт пакеты с React-зависимостями и запишет их список и признаки определения в \`sourceDiscovery.matches\`. Глубина не ограничена тремя уровнями; действует защитный предел обхода. Никакого сканирования всего BILLY при неудачном обнаружении больше нет. Отчёт появится по адресу \`C:\Users\levenskikh\Desktop\selfreview-data\billy\react-apps.mine.json\`. При повторном запуске существующий каталог не перезаписывается.

Для большого BILLY сначала проверь обнаруженные каталоги, не читая исходники и не изменяя каталог правил:

~~~powershell
node .\bin\selfreview.mjs quickstart --project-path 'C:\Users\levenskikh\Desktop\billy' --discover-only
~~~

Поле `sourceDiscovery.matches` покажет пути к вложенным React-пакетам, SHA-256 соответствующих `package.json` и признаки React-зависимостей. При неполном обнаружении команда возвращает exit 2 и не запускает сканирование всего монорепозитория.

Чтобы **обогатить каталог кандидатами** и при желании запустить P2:

~~~powershell
node .\bin\selfreview.mjs quickstart --project-path 'C:\Users\levenskikh\Desktop\billy' --enrich --semantic
~~~

Если твои утверждённые правила находятся в **другом** каталоге, передай **точный существующий** \`--config\` вместо создания нового, иначе quickstart не сможет их угадать:

~~~powershell
node .\bin\selfreview.mjs quickstart --project-path 'C:\Users\levenskikh\Desktop\billy' --config 'C:\PATH\TO\EXISTING\selfreview.config.json' --enrich --semantic
~~~

Сначала проверь \`configCreated\`, \`mining.coverage\`, \`semantic.coverage\` и \`sourceDiscovery\` в выводе. Если нужно явно указать исходники, добавь \`--source-path 'C:\Users\levenskikh\Desktop\billy\react-apps'\`. Если несколько несовместимых tsconfig, программа откажется выбирать случайный и покажет список; тогда выбери конкретный \`--tsconfig\` и анализируй apps отдельно. \`INCOMPLETE\` не означает «правила проверены».


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
