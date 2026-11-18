import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { FileDiff } from "./types.js";

function git(repoRoot: string, args: string[]): string {
    return execFileSync("git", ["-C", repoRoot, ...args], {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 256,
    });
}

interface NameStatusEntry {
    status: "A" | "M" | "D" | "R";
    path: string;
    oldPath?: string;
}

function parseNameStatus(raw: string): NameStatusEntry[] {
    const entries: NameStatusEntry[] = [];
    for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        const parts = line.split("\t");
        const code = parts[0][0] as "A" | "M" | "D" | "R";
        if (code === "R") {
            entries.push({ status: "R", oldPath: parts[1], path: parts[2] });
        } else {
            entries.push({ status: code, path: parts[1] });
        }
    }
    return entries;
}

/** Парсит заголовки хунков unified=0 diff, возвращает добавленные строки новой версии файла. */
function parseAddedLines(unifiedDiff: string): Set<number> {
    const added = new Set<number>();
    const hunkRe = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
    let m: RegExpExecArray | null;
    while ((m = hunkRe.exec(unifiedDiff))) {
        const newStart = parseInt(m[1], 10);
        const newLines = m[2] !== undefined ? parseInt(m[2], 10) : 1;
        for (let i = 0; i < newLines; i++) added.add(newStart + i);
    }
    return added;
}

function parseNumstat(raw: string): { insertions: number; deletions: number } {
    const line = raw.split("\n").find((l) => l.trim());
    if (!line) return { insertions: 0, deletions: 0 };
    const [ins, del] = line.split("\t");
    return { insertions: Number(ins) || 0, deletions: Number(del) || 0 };
}

/**
 * Какие изменения попадают в проверку:
 * - "branch" — только закоммиченный дифф ветки `base...head` (ровно как в merge request);
 * - "branchAndLocal" — дифф ветки `base...head` ПЛЮС незакоммиченные правки рабочего дерева
 *   (staged + unstaged + untracked). По умолчанию для includeWorkingTree=true;
 * - "local" — только незакоммиченные правки рабочего дерева, без диффа ветки.
 */
export type DiffScope = "branch" | "branchAndLocal" | "local";

export interface GetChangedFilesOptions {
    /** ограничить сравнение конкретными путями/glob-паттернами git pathspec */
    pathspec?: string[];
    /**
     * учитывать незакоммиченные изменения рабочего дерева (staged/unstaged + untracked),
     * добавляя их ПОВЕРХ диффа ветки `base...head` (scope "branchAndLocal").
     * Без этого флага проверяется только закоммиченный дифф ветки (scope "branch").
     */
    includeWorkingTree?: boolean;
    /**
     * при includeWorkingTree=true: проверять ТОЛЬКО незакоммиченные изменения рабочего дерева
     * (staged/unstaged + untracked), не включая дифф ветки `base...head` (scope "local").
     */
    localOnly?: boolean;
}

function diffScope(options: GetChangedFilesOptions): DiffScope {
    if (options.localOnly) return "local";
    if (!options.includeWorkingTree) return "branch";
    return "branchAndLocal";
}

/** merge-base двух ревизий — база трёхточечного сравнения. */
function mergeBaseOf(repoRoot: string, base: string, head: string): string {
    return git(repoRoot, ["merge-base", base, head]).trim();
}

/** Абсолютный путь к файлу repoRoot/path (diff-пути используют '/'). */
function absolutePath(repoRoot: string, path: string): string {
    return join(repoRoot, ...path.split("/"));
}

/** Учёт неотслеживаемых файлов (untracked), с учётом pathspec; игнорируемые исключены. */
export function listUntracked(repoRoot: string, pathspec?: string[]): string[] {
    const args = ["ls-files", "--others", "--exclude-standard", "-z"];
    const pathArgs = pathspec && pathspec.length ? ["--", ...pathspec] : [];
    return git(repoRoot, [...args, ...pathArgs]).split("\0").filter(Boolean);
}

function countLines(text: string): number {
    if (text === "") return 0;
    const newlines = (text.match(/\n/g) ?? []).length;
    return text.endsWith("\n") ? newlines : newlines + 1;
}

/** Рев-парсинг ref'а; undefined, если ref не разрешается (например, нет HEAD в пустом репо). */
function revParse(repoRoot: string, ref: string): string | undefined {
    try {
        return git(repoRoot, ["rev-parse", ref]).trim();
    } catch {
        return undefined;
    }
}

/**
 * Собирает FileDiff для одного файла: добавленные строки и numstat считаются одним
 * git-diff по переданному набору ревизий (refArgs), поэтому линии always выровнены
 * с тем содержимым, откуда источник будет прочитан (см. readFromWorktree).
 */
function diffEntry(
    repoRoot: string,
    refArgs: string[],
    path: string,
    status: "A" | "M" | "R",
    readFromWorktree: boolean,
    oldPath?: string,
): FileDiff {
    const unified = git(repoRoot, ["diff", "--unified=0", ...refArgs, "--", path]);
    const addedLines = parseAddedLines(unified);

    const numstat = parseNumstat(git(repoRoot, ["diff", "--numstat", ...refArgs, "--", path]));
    const numstatNoWs = parseNumstat(git(repoRoot, ["diff", "--numstat", "-w", ...refArgs, "--", path]));

    const isWhitespaceOnly =
        numstat.insertions + numstat.deletions > 0 &&
        numstatNoWs.insertions + numstatNoWs.deletions === 0;

    return {
        path,
        oldPath,
        status: status === "A" ? "added" : status === "R" ? "renamed" : "modified",
        addedLines,
        readFromWorktree,
        isWhitespaceOnly,
        stat: numstat,
        statIgnoreWhitespace: numstatNoWs,
    };
}

/** Закоммиченная часть диффа ветки: base...head (трёхточечный diff merge-base..head). */
function committedEntries(repoRoot: string, base: string, head: string, pathArgs: string[]): FileDiff[] {
    const entries = parseNameStatus(git(repoRoot, ["diff", "--name-status", `${base}...${head}`, ...pathArgs]));
    const result: FileDiff[] = [];
    for (const entry of entries) {
        if (entry.status === "D") continue; // удалённые файлы не проверяем
        result.push(diffEntry(repoRoot, [`${base}...${head}`], entry.path, entry.status, false, entry.oldPath));
    }
    return result;
}

/**
 * Локально изменённые файлы текущего чекаута: git diff HEAD (staged+unstaged) плюс untracked.
 * Отличается от committedEntries тем, что не зависит от того, какая ветка передана в head —
 * это чистые незакоммиченные правки, а не «дифф чекаута от merge-base».
 */
function localEntries(repoRoot: string, pathArgs: string[]): FileDiff[] {
    const result: FileDiff[] = [];
    let tracked: NameStatusEntry[] = [];
    try {
        tracked = parseNameStatus(git(repoRoot, ["diff", "--name-status", "HEAD", ...pathArgs]));
    } catch {
        // нет HEAD (пустое репо) — локальных правок tracked не бывает
    }
    for (const entry of tracked) {
        if (entry.status === "D") continue;
        result.push(diffEntry(repoRoot, ["HEAD"], entry.path, entry.status, true, entry.oldPath));
    }
    return result;
}

/** Untracked-файл как новый: все строки — добавленные, читается с диска. */
function untrackedEntries(repoRoot: string, untrackedPaths: string[]): FileDiff[] {
    const result: FileDiff[] = [];
    for (const path of untrackedPaths) {
        let text: string;
        try {
            text = readFileSync(absolutePath(repoRoot, path), "utf8");
        } catch {
            continue; // файл исчез между листингом и чтением
        }
        const lines = countLines(text);
        result.push({
            path,
            status: "added",
            addedLines: lines === 0 ? new Set() : new Set(Array.from({ length: lines }, (_, i) => i + 1)),
            readFromWorktree: true,
            isWhitespaceOnly: lines === 0,
            stat: { insertions: lines, deletions: 0 },
            statIgnoreWhitespace: { insertions: lines, deletions: 0 },
        });
    }
    return result;
}

export function getChangedFiles(
    repoRoot: string,
    base: string,
    head: string,
    options: GetChangedFilesOptions = {},
): FileDiff[] {
    const scope = diffScope(options);
    const pathArgs = options.pathspec && options.pathspec.length ? ["--", ...options.pathspec] : [];

    // branch:  закоммиченный дифф ветки base...head — ровно как в merge request
    if (scope === "branch") {
        return committedEntries(repoRoot, base, head, pathArgs);
    }

    // local: только незакоммиченные правки (staged/unstaged + untracked)
    if (scope === "local") {
        return [...localEntries(repoRoot, pathArgs), ...untrackedEntries(repoRoot, listUntracked(repoRoot, options.pathspec))];
    }

    // branchAndLocal: дифф ветки (как в MR) ПОВЕРХ которого наложены локальные правки.
    // Ключевое отличие от старого «merge-base → рабочее дерево»: закоммиченная часть всегда
    // считается по ревизиям (base...head), а не по диску, поэтому не зависит от того,
    // какая ветка выкачана в ворктри. Старый вариант тянул весь дифф выкачанной ветки
    // (например, 900+ файлов чужой ветки), когда head отличался от текущего чекаута.
    const committed = committedEntries(repoRoot, base, head, pathArgs);
    const committedKeys = new Set(committed.map((f) => f.path));

    const local = localEntries(repoRoot, pathArgs);
    const localKeys = new Set(local.map((f) => f.path));
    const untracked = listUntracked(repoRoot, options.pathspec);
    for (const path of untracked) localKeys.add(path);

    const checkoutHead = revParse(repoRoot, "HEAD");
    const headRef = revParse(repoRoot, head);
    const sameCheckout = checkoutHead !== undefined && checkoutHead === headRef;

    const result: FileDiff[] = [];

    // файлы из диффа ветки
    for (const f of committed) {
        if (!localKeys.has(f.path)) {
            // только в ветке — читаем из ревизии head (гit show), не с диска
            result.push(f);
        } else if (sameCheckout) {
            // файл и в ветке, и локально правлен, а чекаут = head: один diff от merge-base
            // даёт добавленные строки ветки И локальной правки, выровненные по рабочему дереву
            result.push(diffEntry(repoRoot, [mergeBaseOf(repoRoot, base, head)], f.path, f.status === "added" ? "A" : f.status === "renamed" ? "R" : "M", true, f.oldPath));
        } else {
            // чекаут — другая ветка (ревизия чужая): держимся семантики MR, локальную правку
            // чужой ветки в этот файл не примешиваем
            result.push(f);
        }
    }

    // локально изменённые файлы, которых нет в диффе ветки
    for (const f of local) {
        if (!committedKeys.has(f.path)) result.push(f);
    }
    for (const f of untrackedEntries(repoRoot, untracked)) {
        if (!committedKeys.has(f.path)) result.push(f);
    }

    return result;
}

export function hasFileInSnapshot(repoRoot: string, head: string, file: FileDiff, path: string): boolean {
    if (file.readFromWorktree) {
        return statSync(absolutePath(repoRoot, path), { throwIfNoEntry: false })?.isFile() ?? false;
    }
    const entry = git(repoRoot, ["--literal-pathspecs", "ls-tree", "-z", "--full-tree", head, "--", path]);
    return /^[0-7]+ blob /.test(entry);
}

export function listFilesAtRef(repoRoot: string, head: string, directory: string): string[] {
    const entries = git(repoRoot, ["--literal-pathspecs", "ls-tree", "-r", "-z", "--name-only", "--full-tree", head, "--", directory]);
    return entries.split("\0").filter(Boolean);
}

/** Содержимое файла на head (git show), а не с диска — не зависит от состояния рабочего дерева. */
export function readFileAtRef(repoRoot: string, head: string, path: string): string {
    return git(repoRoot, ["show", `${head}:${path}`]);
}

/** Содержимое файла с диска (рабочее дерево) — свежие незакоммиченные правки. */
export function readFileAtWorktree(repoRoot: string, path: string): string {
    return readFileSync(absolutePath(repoRoot, path), "utf8");
}
