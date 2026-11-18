import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding, Severity } from "../../../core/src/index.js";

export type { Finding, Severity } from "../../../core/src/index.js";

export interface FileDiff {
    /** путь относительно корня репозитория, POSIX-слеши */
    path: string;
    oldPath?: string;
    status: "added" | "modified" | "renamed" | "deleted";
    /** строки, добавленные в HEAD (1-indexed, по данным unified diff) */
    addedLines: Set<number>;
    /**
     * откуда читать содержимое файла: true — рабочее дерево (незакоммиченные/локальные правки),
     * false/undefined — ревизия head (`git show head:path`). Выставляется пофайлово движком диффа:
     * файлы, изменённые только в ветке (committed-часть), читаются из ревизии head и не зависят
     * от того, какая ветка в текущий момент выкачана в ворктри; локальные/untracked — с диска.
     */
    readFromWorktree?: boolean;
    /** true, если правки этого файла ограничены пробелами/переносами (по diff -w) */
    isWhitespaceOnly: boolean;
    /** insertions/deletions по обычному diff и по diff -w, для MISC-8 */
    stat: { insertions: number; deletions: number };
    statIgnoreWhitespace: { insertions: number; deletions: number };
}

export interface ScssClassToken {
    className: string;
    line: number;
    /** найден внутри :global(...) — явный сигнал "глобальный класс" (CSS-модули) */
    isGlobalWrap: boolean;
}

export interface RuleContext {
    file: FileDiff;
    /** полное содержимое файла на HEAD */
    sourceText: string;
    repoRoot: string;
    /** Related sources from the same review snapshot (relative repository paths). */
    readRelatedSource?: (path: string) => string | undefined;
    hasRelatedFile?: (path: string) => boolean;
    listRelatedFiles?: (directory: string) => string[];
    /**
     * AST файла, распарсенный ОДИН раз на файл раннером (правило крита: не парсить N раз).
     * null — если файл не TS/TSX или не парсится. Правила обязаны использовать ctx.ast,
     * а не вызывать parseTs сами (для тестов, строящих контекст напрямую, есть fallback).
     */
    ast?: TSESTree.Program | null;
    /** токены классов SCSS/CSS, посчитанные один раз на файл */
    scssTokens?: ScssClassToken[];
}

export interface Rule {
    id: string;
    severity: Severity;
    title: string;
    /** какие файлы правило вообще рассматривает */
    appliesTo: (path: string) => boolean;
    /**
     * если true — правило само решает, какие строки репортить (например, правило уровня файла,
     * не привязанное к конкретной добавленной строке). Если false (по умолчанию) — раннер
     * оставит только findings, чья line входит в file.addedLines.
     */
    fileLevel?: boolean;
    /** правило использует ctx.ast (раннер распарсит файл один раз и закэширует в контекст) */
    usesAst?: boolean;
    /** правило использует ctx.scssTokens (раннер просканирует SCSS-классы один раз) */
    usesScssTokens?: boolean;
    check: (ctx: RuleContext) => Finding[];
}
