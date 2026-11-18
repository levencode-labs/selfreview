import type { Finding, FixSpec, Severity, SourceRange, SuggestionSpec } from "../types.js";

export interface DetectorInput {
    program: import("@typescript-eslint/typescript-estree").TSESTree.Program | null;
    sourceText: string;
    filePath: string;
}

/**
 * Вне-AST контекст общих детекторов — то, что auditor знает из diff, а ESLint получает
 * из git/файловой системы. Позволяет одному детектору обслуживать и auditor, и ESLint
 * (parity by construction), оставаясь чистым по сигнатуре (program, sourceText, filePath, state?).
 */
export interface DetectorState {
    /** файл добавлен или переименован в ветке (для правил «только новый файл») */
    isNew?: boolean;
    isRenamed?: boolean;
    isDeleted?: boolean;
    /** корень git-репозитория — для правил, проверяющих соседние файлы/дерево фичи (MVVM-2, MISC-12) */
    repoRoot?: string;
    /**
     * строки, добавленные в diff (auditor, 1-based). Если не задано (ESLint) — детектор
     * работает по всему файлу (режим «максимум» для review-пресета).
     */
    addedLines?: Set<number>;
    /** Read related TS sources from the same snapshot as the inspected file; undefined means unavailable. */
    readSource?: (filePath: string) => string | undefined;
    /** Presence in the snapshot of the inspected file. */
    hasFile?: (filePath: string) => boolean;
    /** Recursive file paths from the inspected Git snapshot, when available. */
    listFiles?: (directory: string) => string[];
}

/**
 * Единая функция построения normalized Finding.
 * `line`/`column` (auditor-legacy) выводятся из `loc`; column — 1-based.
 */
export function makeFinding(
    ruleId: string,
    severity: Severity,
    message: string,
    filePath: string,
    loc?: SourceRange,
    fix?: FixSpec,
    suggestions?: SuggestionSpec[],
): Finding {
    return {
        ruleId,
        severity,
        message,
        line: loc?.start.line,
        column: loc ? loc.start.column + 1 : undefined,
        loc,
        fix,
        suggestions,
        file: filePath,
    };
}

/** Стартовая позиция узла как SourceRange (без end). */
export function nodeStartRange(node: { loc?: { start: { line: number; column: number } } } | null | undefined): SourceRange | undefined {
    if (!node?.loc) return undefined;
    return { start: { line: node.loc.start.line, column: node.loc.start.column } };
}

export { isTsFile, isTsxFile, basename, dirname, stripExt, isCamelCase, isPascalCase, nodeText, walk } from "../ast/walk.js";
