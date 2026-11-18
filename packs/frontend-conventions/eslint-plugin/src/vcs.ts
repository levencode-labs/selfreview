import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";
import type { DetectorState } from "../../core/src/index.js";

/**
 * Git-aware резолвер DetectorState для ESLint-правил.
 *
 * Для правила «новый файл» (MVVM-2, FS-1/2/4/5/13/14, MISC-4, RUI-2) нужен статус файла
 * относительно базы ветки — auditor получает его из diff, ESLint — отсюда.
 *
 * Производительность: на репозиторий выполняется ровно один `git status --porcelain -z`
 * и один `git diff --name-status <base>...HEAD -z`, кэш инвалидируется по mtime .git/index
 * (редактор меняет файлы между прогонами — статус не должен устаревать).
 */

interface RepoCache {
    repoRoot: string;
    base: string;
    indexPath: string | null;
    indexMtimeMs: number;
    worktree: Map<string, string>;
    branch: Map<string, string>;
}

const cache = new Map<string, RepoCache>();

function git(root: string, args: string[]): string | null {
    try {
        return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 1024 * 1024 * 16, stdio: ["pipe", "pipe", "pipe"] }).toString();
    } catch {
        return null;
    }
}

function indexMtimeMs(repoRoot: string): number | null {
    const indexPath = git(repoRoot, ["rev-parse", "--git-path", "index"])?.trim();
    if (!indexPath) return null;
    const abs = join(repoRoot, ...indexPath.split(/[\\/]/));
    try {
        return statSync(abs).mtimeMs;
    } catch {
        return null;
    }
}

function parseStatusPorcelain(raw: string): Map<string, string> {
    const map = new Map<string, string>();
    const records = raw.split("\0");
    for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        if (rec.length < 4) continue;
        const xy = rec.slice(0, 2);
        let path = rec.slice(3);
        // renames/copies в porcelain: "XY old\0new\0"
        if ((xy[0] === "R" || xy[0] === "C") && i + 1 < records.length && path === "") {
            path = records[i + 1];
            i++;
        }
        map.set(path, xy);
    }
    return map;
}

function parseNameStatusZ(raw: string): Map<string, string> {
    const map = new Map<string, string>();
    const records = raw.split("\0");
    for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        if (rec.length < 2) continue;
        const status = rec[0];
        if (status === "R" || status === "C") {
            // "R100\0old\0new"
            if (i + 1 < records.length) {
                map.set(records[i + 1], "R");
                map.set(records[i + 2] ?? "", "R");
                i += 2;
            }
        } else {
            map.set(rec.slice(1), status);
        }
    }
    return map;
}

function getRepoInfo(repoRoot: string, base: string): RepoCache | null {
    const mtime = indexMtimeMs(repoRoot);
    if (mtime === null) return null; // не git или bare

    const key = `${repoRoot}|${base}`;
    const cached = cache.get(key);
    if (cached && cached.indexMtimeMs === mtime) return cached;

    const head = git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"])?.trim() || "HEAD";
    const worktree = parseStatusPorcelain(git(repoRoot, ["status", "--porcelain", "-z"]) ?? "");
    const branch = parseNameStatusZ(git(repoRoot, ["diff", "--name-status", "-z", `${base}...${head}`]) ?? "");

    const info: RepoCache = {
        repoRoot,
        base,
        indexPath: git(repoRoot, ["rev-parse", "--git-path", "index"])?.trim() ?? null,
        indexMtimeMs: mtime,
        worktree,
        branch,
    };
    cache.set(key, info);
    return info;
}

/**
 * Статус файла относительно базы ветки. Если git недоступен/вне репозитория —
 * возвращаем пустой state (правила-«новый-файл» в этом случае молчат, безопасно).
 */
export function resolveState(cwd: string, filename: string, base = "origin/release"): DetectorState {
    try {
        const repoRoot = git(cwd, ["rev-parse", "--show-toplevel"])?.trim();
        if (!repoRoot) return {};

        const rel = filename.startsWith(repoRoot)
            ? filename.slice(repoRoot.length + 1).replace(/\\/g, "/")
            : filename.replace(/\\/g, "/");

        const info = getRepoInfo(repoRoot, base);
        if (!info) return { repoRoot };

        const wt = info.worktree.get(rel) ?? "";
        const br = info.branch.get(rel) ?? "";
        // «новый»: untracked, staged add или добавлен/переименован в ветке относительно базы
        const isNew = wt === "??" || wt.startsWith("A") || br === "A" || br === "R" || br === "C";
        const isRenamed = br === "R" || br === "C";
        const isDeleted = br === "D" || (wt.length === 2 && wt[0] === "D");

        return { repoRoot, isNew, isRenamed, isDeleted };
    } catch {
        return {};
    }
}

/** Фабрика резолверов для правил (base настраивается). */
export function createStateResolver(base = "origin/release"): (cwd: string, filename: string) => DetectorState {
    return (cwd, filename) => resolveState(cwd, filename, base);
}
