import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { scanScssClassTokens } from "../scss/scan.js";

/**
 * CSS-1: camelCase-классы в новых стилях (не дефисные). Строковый сканер — ESLint не парсит SCSS.
 */
export function detectCss1(
    _program: import("@typescript-eslint/typescript-estree").TSESTree.Program | null,
    sourceText: string,
    filePath: string,
    _state: import("./helpers.js").DetectorState = {},
): Finding[] {
    const findings: Finding[] = [];
    for (const token of scanScssClassTokens(sourceText)) {
        if (token.className.includes("-")) {
            findings.push(
                makeFinding(
                    "CSS-1",
                    "MUST",
                    `Класс ".${token.className}" — через дефис. Новые стили в React — camelCase, без дефисов (CSS-1)`,
                    filePath,
                    { start: { line: token.line, column: 0 } },
                ),
            );
        }
    }
    return findings;
}
