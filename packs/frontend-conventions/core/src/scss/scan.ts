import type { ScssClassToken } from "../types.js";

const GLOBAL_WRAP_RE = /:global\(\s*\.([a-zA-Z_][a-zA-Z0-9_-]*)\)/g;
const CLASS_TOKEN_RE = /\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g;

/**
 * Лёгкий построчный regex-скан классов в SCSS вместо полноценного AST-парсинга (postcss-scss):
 * не зависит от валидности SCSS-специфичного синтаксиса (@include, interpolation, вложенность),
 * не требует отдельной npm-зависимости. Единый источник правды для auditor и ESLint (CSS-1/CSS-3).
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
