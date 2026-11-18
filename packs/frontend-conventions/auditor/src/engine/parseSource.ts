import { parse as parseTsEstree, type TSESTree } from "@typescript-eslint/typescript-estree";
import type { ScssClassToken } from "./types.js";

export function isTsFile(path: string): boolean {
    return /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts");
}

export function isScssFile(path: string): boolean {
    return /\.scss$/.test(path);
}

/** .ts uses TypeScript grammar; only .tsx enables JSX. Failures remain null for runner diagnostics. */
export function parseTs(sourceText: string, path: string): TSESTree.Program | null {
    try {
        return parseTsEstree(sourceText, {
            jsx: path.endsWith(".tsx"),
            loc: true,
            range: true,
            comment: true,
            tokens: true,
            errorOnUnknownASTType: false,
        });
    } catch (e) {
        // Ошибка остаётся null; runner сообщает PARSE_FAILED, adapters не парсят файл повторно.
        return null;
    }
}

const GLOBAL_WRAP_RE = /:global\(\s*\.([a-zA-Z_][a-zA-Z0-9_-]*)\)/g;
const CLASS_TOKEN_RE = /\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g;

/**
 * Лёгкий построчный regex-скан классов в SCSS вместо полноценного AST-парсинга (postcss-scss):
 * не зависит от валидности SCSS-специфичного синтаксиса (@include, interpolation, вложенность),
 * не требует отдельной npm-зависимости. Достаточно для CSS-1/CSS-3 (имя класса + номер строки).
 */
export function scanScssClassTokens(sourceText: string): ScssClassToken[] {
    const tokens: ScssClassToken[] = [];
    const lines = sourceText.split("\n");

    lines.forEach((rawLine, idx) => {
        const codeOnly = rawLine.replace(/\/\/.*$/, "");

        const globalNames = new Set<string>();
        GLOBAL_WRAP_RE.lastIndex = 0;
        let gm: RegExpExecArray | null;
        while ((gm = GLOBAL_WRAP_RE.exec(codeOnly))) globalNames.add(gm[1]);

        CLASS_TOKEN_RE.lastIndex = 0;
        let cm: RegExpExecArray | null;
        while ((cm = CLASS_TOKEN_RE.exec(codeOnly))) {
            tokens.push({ className: cm[1], line: idx + 1, isGlobalWrap: globalNames.has(cm[1]) });
        }
    });

    return tokens;
}

export type { ScssClassToken };
