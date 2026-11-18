/**
 * Публичный API пакета @selfreview/conventions-auditor.
 *
 * Для приложений (Desktop) главная точка входа — runCheck(): один вызов делает всю работу
 * (конфиг, diff, прогон правил, сортировка, счётчики, внутренние диагностики) и
 * возвращает результат, готовый к сериализации в IPC/UI.
 *
 * Низкоуровневые примитивы (getChangedFiles, runRules, formatters и т.п.) экспортируются
 * для CLI и тестов — это то же самое, что использовалось раньше через deep-imports.
 */

import { loadConfig } from "./engine/config.js";
import { getChangedFiles, hasFileInSnapshot, listFilesAtRef, readFileAtRef, readFileAtWorktree, listUntracked, type GetChangedFilesOptions } from "./engine/gitDiff.js";
import { runRules, type RunOptions } from "./engine/runner.js";
import { sortFindings } from "./engine/report.js";
import { allRules } from "./rules/index.js";
import { manualChecklist, type ManualChecklistItem } from "./rules/manualChecklist.js";
import type { InternalDiagnostic } from "./engine/diagnostics.js";
import type { FileDiff, Finding, Severity } from "./engine/types.js";

export const VERSION = "1.0.0";

export interface CheckRequest {
    /** путь к git-репозиторию */
    repoPath: string;
    /** база сравнения (default: origin/release) */
    base?: string;
    /** ветка фичи (default: HEAD) */
    head?: string;
    /** git pathspec, сужающий сравнение */
    pathspec?: string | string[];
    /**
     * учитывать незакоммиченные изменения рабочего дерева (default: false).
     * true — закоммиченный diff ветки `base...head` (как в MR) дополняется незакоммиченными
     * правками (staged/unstaged + untracked). Коммиченная часть всегда читается из ревизии
     * head, поэтому не зависит от того, какая ветка выкачана в рабочем дереве.
     */
    includeWorkingTree?: boolean;
    /**
     * при includeWorkingTree=true: проверять ТОЛЬКО незакоммиченные изменения рабочего дерева
     * (staged/unstaged + untracked), исключив закоммиченный diff ветки.
     */
    localOnly?: boolean;
    /**
     * собственный список правил для точного прогона (например включить REDUX-8,
     * который по умолчанию не в allRules). По умолчанию — allRules.
     */
    ruleIds?: string[];
    /** не возвращать ручной чек-лист (default: false) */
    noChecklist?: boolean;
}

export interface CheckReport {
    findings: Finding[];
    filesChanged: number;
    counts: Record<Severity, number>;
    manualChecklist: ManualChecklistItem[];
    /** внутренние диагностики движка (правило упало / не спарсилось / не прочитался файл) */
    internalDiagnostics: InternalDiagnostic[];
    /** исходники изменённых файлов (path → содержимое на HEAD) — для построения excerpt в UI */
    sources: Record<string, string>;
}

/** Один высокоуровневый вызов всей проверки — то, что нужно Desktop и интеграциям. */
export function runCheck(request: CheckRequest): CheckReport {
    const { repoPath, base = "origin/release", head = "HEAD", noChecklist = false } = request;
    const includeWorkingTree = Boolean(request.includeWorkingTree);
    const localOnly = Boolean(request.localOnly);

    const pathspec: string[] | undefined = request.pathspec
        ? (Array.isArray(request.pathspec) ? request.pathspec : [request.pathspec]).filter((p) => p.trim())
        : undefined;

    const config = loadConfig(repoPath);
    const files = getChangedFiles(repoPath, base, head, { pathspec, includeWorkingTree, localOnly } as GetChangedFilesOptions);

    const rules = request.ruleIds ? allRules.filter((r) => request.ruleIds!.includes(r.id)) : allRules;

    const internalDiagnostics: InternalDiagnostic[] = [];
    const sources: Record<string, string> = {};
    const readSource = (file: FileDiff): string => {
        const cached = sources[file.path];
        if (cached !== undefined) return cached;
        // источник выбирается пофайлово движком диффа: файлы committed-части ветки читаются
        // из ревизии head (не зависят от выкачанной ветки), локальные/untracked — с диска
        const text = file.readFromWorktree
            ? readFileAtWorktree(repoPath, file.path)
            : readFileAtRef(repoPath, head, file.path);
        sources[file.path] = text;
        return text;
    };

    const findings: Finding[] = runRules({
        repoRoot: repoPath,
        files,
        readSource,
        hasRelatedFile: (file, path) => hasFileInSnapshot(repoPath, head, file, path),
        listRelatedFiles: (directory) => listFilesAtRef(repoPath, head, directory),
        readRelatedSource: (path) => {
            const related = files.find(file => file.path === path);
            return related ? readSource(related) : readFileAtRef(repoPath, head, path);
        },
        rules,
        config,
        onInternalDiagnostic: (d) => internalDiagnostics.push(d),
    } satisfies RunOptions);

    const sorted = sortFindings(findings);
    const counts: Record<Severity, number> = { BLOCK: 0, MUST: 0, SHOULD: 0, info: 0 };
    for (const f of sorted) counts[f.severity]++;

    return {
        findings: sorted,
        filesChanged: files.length,
        counts,
        manualChecklist: noChecklist ? [] : manualChecklist,
        internalDiagnostics,
        sources,
    };
}

// Примитивы (для CLI, доктора, тестов и нетривиальных интеграций)
export { loadConfig, getChangedFiles, listUntracked, readFileAtRef, readFileAtWorktree, runRules, sortFindings, allRules, manualChecklist };
export type { RunOptions, GetChangedFilesOptions, FileDiff, Finding, Severity, ManualChecklistItem, InternalDiagnostic };

// Реестр и форматтеры
export { formatText, formatJson, formatSarif, formatChecklist, formatRules, formatDiagnostics } from "./engine/report.js";
export { describeDiagnostic } from "./engine/diagnostics.js";
export { ruleRegistry, allActiveRules, eslintSupportedRules, getRuleMetadata, getRuleSource, getRuleTitle, getRuleSeverity, manualChecklistRegistry } from "../../core/src/index.js";
export { defaultConfig } from "./engine/config.js";
