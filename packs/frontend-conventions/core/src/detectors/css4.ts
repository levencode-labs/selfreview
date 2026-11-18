import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";

/** px-значения (целые и дробные). */
const PX_RE = /(\d+(?:\.\d+)?)px\b/g;
/** тонкие разделители-границы — единственное общепринятое исключение из кратности 4 */
const ALLOWED_NON_MULTIPLE = new Set(["1px"]);

function lineAt(text: string, index: number): number {
    let line = 1;
    for (let i = 0; i < index && i < text.length; i++) if (text[i] === "\n") line++;
    return line;
}

/**
 * CSS-4: все пиксельные размеры кратны 4 (память/variable-сетка дизайн-системы). Работает по тексту
 * файла — ESLint не парсит SCSS. Исключение: 1px (границы-разделители).
 */
export function detectCss4(
    _program: import("@typescript-eslint/typescript-estree").TSESTree.Program | null,
    sourceText: string,
    filePath: string,
    _state: import("./helpers.js").DetectorState = {},
): Finding[] {
    const findings: Finding[] = [];
    PX_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PX_RE.exec(sourceText))) {
        const raw = m[0];
        if (ALLOWED_NON_MULTIPLE.has(raw)) continue;
        const value = parseFloat(m[1]);
        if (value % 4 === 0) continue;
        findings.push(
            makeFinding(
                "CSS-4",
                "MUST",
                `Размер ${raw} — не кратен 4. Все размеры/отступы/шрифты кратны 4 (исключение: 1px-границы при необходимости) (CSS-4)`,
                filePath,
                { start: { line: lineAt(sourceText, m.index), column: 0 } },
            ),
        );
    }
    return findings;
}
