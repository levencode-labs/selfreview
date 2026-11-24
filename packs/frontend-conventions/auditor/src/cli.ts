#!/usr/bin/env node
import { profile } from "../../core/src/index.js";
import { resolve } from "node:path";
import { writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { getChangedFiles, hasFileInSnapshot, listFilesAtRef, readFileAtRef, readFileAtWorktree } from "./engine/gitDiff.js";
import { loadConfig, type FrontendConfig } from "./engine/config.js";
import { runRules } from "./engine/runner.js";
import { formatChecklist, formatJson, formatRules, formatSarif, formatText, sortFindings, formatDiagnostics } from "./engine/report.js";
import { allRules } from "./rules/index.js";
import { manualChecklist } from "./rules/manualChecklist.js";
import type { Finding } from "./engine/types.js";
import type { InternalDiagnostic } from "./engine/diagnostics.js";

const VERSION = "1.0.0";

const USAGE = `frontend-conventions — проверка diff ветки от базы на соответствие договорённостям frontend

Использование:
  frontend-conventions check --repo <путь> [--base origin/release] [--head HEAD]
                         [--format text|json|sarif] [--out файл] [--strict]
                         [--path <pathspec>] [--no-checklist] [--worktree] [--local-only] [--duplicates]
  frontend-conventions rules [--eslint]
  frontend-conventions doctor --repo <путь> [--base ...] [--head ...]
  frontend-conventions --help | --version

Команды:
  check   запустить проверку diff (по умолчанию)
  rules   показать реестр правил и поддержку ESLint
  doctor  диагностика окружения: node/git/repo/base/head/config

check options:
  --repo <путь>        путь к git-репозиторию (по умолчанию текущая директория)
  --base <ref>         база сравнения (по умолчанию origin/release)
  --head <ref>         ветка фичи (по умолчанию HEAD)
  --path <pathspec>    ограничить сравнение git pathspec (можно повторять, например --path "Web/*")
  --format <fmt>       text | json | sarif (по умолчанию text)
  --out <файл>         записать отчёт в файл вместо stdout
  --strict             exit 1 при BLOCK или MUST; внутренние ошибки движка делают exit 2
  --no-checklist       не печатать ручной чек-лист
  --duplicates         искать совпадающие реализации функций в TS/TSX-файлах diff (info)
  --worktree           учесть незакоммиченные правки: к закоммиченному diff ветки (base...head,
                       как в merge request) добавляются staged/unstaged и untracked-файлы.
                       Закоммиченная часть читается из ревизии head, а не с диска, поэтому
                       не зависит от того, какая ветка выкачана в рабочем дереве
  --local-only         только незакоммиченные правки рабочего дерева (staged/unstaged + untracked),
                       без диффа ветки (подразумевает --worktree)
`;

interface Args {
    repo: string;
    base: string;
    head: string;
    format: "text" | "json" | "sarif";
    out?: string;
    strict: boolean;
    pathspec: string[];
    noChecklist: boolean;
    worktree: boolean;
    localOnly: boolean;
    duplicates: boolean;
}

function parseArgs(argv: string[]): Args {
    const args: Args = { repo: process.cwd(), base: "origin/release", head: "HEAD", format: "text", strict: false, pathspec: [], noChecklist: false, worktree: false, localOnly: false, duplicates: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--repo") args.repo = argv[++i];
        else if (a === "--base") args.base = argv[++i];
        else if (a === "--head") args.head = argv[++i];
        else if (a === "--format") args.format = argv[++i] as Args["format"];
        else if (a === "--out") args.out = argv[++i];
        else if (a === "--strict") args.strict = true;
        else if (a === "--path") args.pathspec.push(argv[++i]);
        else if (a === "--no-checklist") args.noChecklist = true;
        else if (a === "--duplicates") args.duplicates = true;
        else if (a === "--worktree") args.worktree = true;
        else if (a === "--local-only") { args.localOnly = true; args.worktree = true; }
    }
    return args;
}

function git(repoRoot: string, args: string[]): string {
    return execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", maxBuffer: 1024 * 1024 * 64, stdio: ["pipe", "pipe", "pipe"] });
}

function gitOk(repoRoot: string, args: string[]): boolean {
    try {
        git(repoRoot, args);
        return true;
    } catch {
        return false;
    }
}

function cmdCheck(args: Args): number {
    const repoRoot = resolve(args.repo);

    const config = loadConfig(repoRoot);
    const files = getChangedFiles(repoRoot, args.base, args.head, { pathspec: args.pathspec, includeWorkingTree: args.worktree, localOnly: args.localOnly });

    const diagnostics: InternalDiagnostic[] = [];
    const findings: Finding[] = runRules({
        repoRoot,
        files,
        readSource: (file) => (file.readFromWorktree ? readFileAtWorktree(repoRoot, file.path) : readFileAtRef(repoRoot, args.head, file.path)),
        hasRelatedFile: (file, path) => hasFileInSnapshot(repoRoot, args.head, file, path),
        listRelatedFiles: (directory) => listFilesAtRef(repoRoot, args.head, directory),
        readRelatedSource: (path) => {
            const related = files.find(file => file.path === path);
            return related?.readFromWorktree
                ? readFileAtWorktree(repoRoot, path)
                : readFileAtRef(repoRoot, args.head, path);
        },
        rules: allRules,
        includeDuplicates: args.duplicates,
        config,
        onInternalDiagnostic: (d) => diagnostics.push(d),
    });

    const sorted = sortFindings(findings);
    const checklist = args.noChecklist ? [] : manualChecklist;

    let output: string;
    if (args.format === "json") {
        const payload: Record<string, unknown> = {
            findings: sorted,
            ...(checklist.length ? { manualChecklist: checklist } : {}),
            ...(diagnostics.length ? { internalDiagnostics: diagnostics } : {}),
            engineVersion: VERSION,
        };
        output = JSON.stringify(payload, null, 2);
    } else if (args.format === "sarif") {
        output = formatSarif(sorted, VERSION);
    } else {
        output = formatText(sorted) + (checklist.length ? formatChecklist(checklist) : "");
        if (diagnostics.length) output += formatDiagnostics(diagnostics);
    }

    if (args.out) {
        writeFileSync(args.out, output, "utf8");
    } else {
        process.stdout.write(output);
    }

    if (diagnostics.length > 0) {
        process.stderr.write(formatDiagnostics(diagnostics));
    }

    const hasBlock = sorted.some((f) => f.severity === "BLOCK");
    const hasMust = sorted.some((f) => f.severity === "MUST");

    if (args.strict && diagnostics.length > 0) {
        return 2; // движок не отработал полностью — нельзя показывать "0 нарушений"
    }
    if (hasBlock || (args.strict && hasMust)) {
        return 1;
    }
    return 0;
}

function cmdRules(eslintOnly: boolean): number {
    const text = formatRules({ eslintOnly });
    process.stdout.write(text);
    return 0;
}

function cmdDoctor(args: { repo: string; base: string; head: string }): number {
    const repoRoot = resolve(args.repo);
    const report: string[] = [];
    let ok = true;

    const check = (label: string, pass: boolean, detail?: string) => {
        report.push(`${pass ? "✔" : "✖"} ${label}${detail ? ` — ${detail}` : ""}`);
        if (!pass) ok = false;
    };

    check("Node ≥ 18", Number(process.versions.node.split(".")[0]) >= 18, `version ${process.versions.node}`);

    try {
        const gitVersion = execFileSync("git", ["--version"], { encoding: "utf8" }).trim();
        check("git установлен", true, gitVersion);
    } catch {
        check("git установлен", false, "git --version не выполняется");
    }

    if (!existsSync(repoRoot)) {
        check("репозиторий существует", false, `нет пути ${args.repo}`);
    } else {
        check("репозиторий существует", true, args.repo);
        check("это git-репозиторий", gitOk(repoRoot, ["rev-parse", "--is-inside-work-tree"]));
        check("база разрешается", gitOk(repoRoot, ["rev-parse", "--verify", args.base]), args.base);
        check("ветка фичи разрешается", gitOk(repoRoot, ["rev-parse", "--verify", args.head]), args.head);
        const cfgPath = resolve(repoRoot, profile.configFile);
        if (existsSync(cfgPath)) {
            const cfg = loadConfig(repoRoot) as FrontendConfig;
            check(
                `конфиг ${profile.configFile} валиден`,
                Array.isArray(cfg.disable) && Array.isArray(cfg.downgradeToInfo) && Array.isArray(cfg.ignore),
                JSON.stringify({ disable: cfg.disable.length, downgradeToInfo: cfg.downgradeToInfo.length, ignore: cfg.ignore.length }),
            );
        } else {
            check(`конфиг ${profile.configFile} валиден`, true, "нет файла — используются defaults");
        }
    }

    process.stdout.write(report.join("\n") + "\n");
    return ok ? 0 : 1;
}

function main(): void {
    const argv = process.argv.slice(2);

    if (argv[0] === "--help" || argv[0] === "-h") {
        process.stdout.write(USAGE);
        return;
    }
    if (argv[0] === "--version" || argv[0] === "-v") {
        process.stdout.write(`frontend-conventions ${VERSION}\n`);
        return;
    }

    let commandName = "check";
    let rest = argv;
    if (argv[0] === "check" || argv[0] === "rules" || argv[0] === "doctor") {
        commandName = argv[0];
        rest = argv.slice(1);
    } else if (argv.length > 0) {
        process.stderr.write(USAGE);
        process.exit(2);
    }

    if (commandName === "rules") {
        const eslintOnly = rest.includes("--eslint");
        process.exit(cmdRules(eslintOnly));
    }
    if (commandName === "doctor") {
        const args = parseArgs(rest);
        process.exit(cmdDoctor(args));
    }

    const args = parseArgs(rest);
    process.exit(cmdCheck(args));
}

main();
