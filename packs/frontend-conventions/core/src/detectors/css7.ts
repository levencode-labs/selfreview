import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";

const DATA_TID_RE = /\[\s*(data-tid)(?=\s|[~|^$*=\]])/g;
const CSS_TOKEN = /\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|[(){};]/g;
const SCSS_TOKEN = new RegExp(String.raw`(?<!:)\/\/[^\r\n]*|` + CSS_TOKEN.source, "g");
const MODULE_RE = /\.module\.(css|scss)$/;

/**
 * CSS-7: data-tid не используем как css-селектор — data-tid предназначен для e2e-тестов,
 * сброс/стилизация/оверрайд делаются по классу, а не по data-tid.
 * Сканируем прелюдию блока, сохраняя позиции многострочных селекторов.
 */
export function detectCss7(
    _program: import("@typescript-eslint/typescript-estree").TSESTree.Program | null,
    sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!MODULE_RE.test(filePath)) return [];

    const findings: Finding[] = [];
    // Match comments and strings before punctuation so their contents cannot create selectors.
    const tokens = filePath.endsWith(".scss") ? SCSS_TOKEN : CSS_TOKEN;
    let prelude = "";
    let offset = 0;
    let start = 0;
    let parens = 0;
    const reportedLines = new Set<number>();
    const lineAt = (index: number) => sourceText.slice(0, index).split("\n").length;

    for (const match of sourceText.matchAll(tokens)) {
        const token = match[0];
        prelude += sourceText.slice(offset, match.index);
        offset = match.index + token.length;
        if (token === "(") parens++;
        if (token === ")") parens = Math.max(0, parens - 1);
        if (token === "{" && !parens && !prelude.trimStart().startsWith("@")) {
            for (const attr of prelude.matchAll(DATA_TID_RE)) {
                const first = lineAt(start + attr.index);
                const last = lineAt(start + attr.index + attr[0].length - 1);
                const line = Array.from({ length: last - first + 1 }, (_, index) => first + index)
                    .find(candidate => state.addedLines?.has(candidate)) ?? last;
                if (reportedLines.has(line)) continue;
                reportedLines.add(line);
                findings.push(makeFinding("CSS-7", "MUST",
                    "data-tid в css-селекторе — data-tid только для тестов; стилизуй/оверрайди по классу, а не по data-tid (CSS-7)",
                    filePath, { start: { line, column: 0 } }));
            }
        }
        if (!parens && (token === "{" || token === "}" || token === ";")) {
            start = offset;
            prelude = "";
        } else if (token.length > 1) {
            prelude += token.replace(/[^\r\n]/g, token.startsWith("/") ? " " : "_");
        } else {
            prelude += token;
        }
    }

    return findings;
}
