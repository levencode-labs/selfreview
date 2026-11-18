import type { Detector, DetectorState } from "../../../core/src/index.js";
import type { Finding, Rule, RuleContext, Severity } from "../engine/types.js";
import { parseTs } from "../engine/parseSource.js";

// Общие AST/путевые утилиты — из shared core (единственный источник).
export { walk, basename, dirname, stripExt, isCamelCase, isPascalCase, nodeText } from "../../../core/src/index.js";

/**
 * Аудитор-legacy makeFinding: принимает контекст (или путь) и плоские line/column —
 * ровно как использовали правила auditor до переезда в monorepo. Shared-detector правила
 * (через astRule) строят finding из core makeFinding с loc; здесь сохраняем совместимость
 * для auditor-only правил уровня файла/проекта, чтобы не переписывать их вызовы.
 */
export function makeFinding(
    ruleId: string,
    severity: Severity,
    message: string,
    fileOrCtx: string | { file: { path: string } } | { file: string },
    line?: number,
    column?: number,
): Finding {
    let file: string;
    if (typeof fileOrCtx === "string") {
        file = fileOrCtx;
    } else if (typeof fileOrCtx.file === "string") {
        file = fileOrCtx.file;
    } else {
        file = fileOrCtx.file.path;
    }
    return { ruleId, severity, message, file, line, column };
}

/**
 * Обёртка аудиторного правила над общим детектором core.
 * `check` использует ctx.ast (раннер парсит файл один раз), а если контекст построен вручную
 * (юнит-тесты) — парсит сам. Один и тот же детектор — единый источник истины для auditor и ESLint.
 */
export function astRule(opts: {
    id: string;
    severity: Severity;
    title: string;
    appliesTo: (path: string) => boolean;
    detector: Detector;
    fileLevel?: boolean;
    usesScssTokens?: boolean;
}): Rule {
    return {
        id: opts.id,
        severity: opts.severity,
        title: opts.title,
        appliesTo: opts.appliesTo,
        fileLevel: opts.fileLevel,
        usesAst: true,
        usesScssTokens: opts.usesScssTokens,
        check(ctx: RuleContext): Finding[] {
            const program = ctx.ast !== undefined ? ctx.ast : parseTs(ctx.sourceText, ctx.file.path);
            return opts.detector(program, ctx.sourceText, ctx.file.path);
        },
    };
}

/**
 * Обёртка аудиторного правила над общим детектором core с передачей вне-AST контекста
 * (статус файла из diff, repoRoot, добаланные строки). audit и ESLint прогоняют ОДИН детектор —
 * для правил уровня файла/проекта (MVVM-2/9, FS-1..14, MISC-4/12, RUI-2, CSS-1..3).
 * `usesAst: false` для правил, которым AST не нужен (path/SCSS-сканеры) — не парсим зря.
 */
export function contextRule(opts: {
    id: string;
    severity: Severity;
    title: string;
    appliesTo: (path: string) => boolean;
    detector: Detector;
    fileLevel?: boolean;
    usesAst?: boolean;
}): Rule {
    return {
        id: opts.id,
        severity: opts.severity,
        title: opts.title,
        appliesTo: opts.appliesTo,
        fileLevel: opts.fileLevel,
        usesAst: opts.usesAst ?? true,
        check(ctx: RuleContext): Finding[] {
            const program = (opts.usesAst ?? true) ? (ctx.ast !== undefined ? ctx.ast : parseTs(ctx.sourceText, ctx.file.path)) : null;
            const state: DetectorState = {
                isNew: ctx.file.status === "added" || ctx.file.status === "renamed",
                isRenamed: ctx.file.status === "renamed",
                isDeleted: ctx.file.status === "deleted",
                repoRoot: ctx.repoRoot,
                addedLines: ctx.file.addedLines,
                readSource: ctx.readRelatedSource,
                hasFile: ctx.hasRelatedFile,
                listFiles: ctx.listRelatedFiles,
            };
            return opts.detector(program, ctx.sourceText, ctx.file.path, state);
        },
    };
}
