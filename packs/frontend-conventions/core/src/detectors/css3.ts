import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { scanScssClassTokens } from "../scss/scan.js";

/**
 * CSS-3: глобальные классы (:global(...)) — с префиксом global_. Без :global() отличить
 * глобальный класс от локального по одному файлу нельзя — проверяем явный сигнал.
 */
export function detectCss3(
    _program: import("@typescript-eslint/typescript-estree").TSESTree.Program | null,
    sourceText: string,
    filePath: string,
    _state: import("./helpers.js").DetectorState = {},
): Finding[] {
    const findings: Finding[] = [];
    for (const token of scanScssClassTokens(sourceText)) {
        if (token.isGlobalWrap && !token.className.startsWith("global_")) {
            findings.push(
                makeFinding(
                    "CSS-3",
                    "MUST",
                    `:global(.${token.className}) — глобальные css-классы начинаются с global_ (CSS-3)`,
                    filePath,
                    { start: { line: token.line, column: 0 } },
                ),
            );
        }
    }
    return findings;
}
