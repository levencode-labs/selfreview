import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";

/** HEX (#rgb/#rrggbb/#rrggbbaa) и функции-цвета rgb()/rgba()/hsl()/hsla(). */
const HEX_COLOR_RE = /#[\da-fA-F]{3,8}\b/g;
const FUNC_COLOR_RE = /rgba?\(\s*\d+(?:\.\d+)?%?\s*,\s*\d+(?:\.\d+)?%?\s*,\s*\d+(?:\.\d+)?%?\s*(?:,\s*[\d.]+%?\s*)?\)|hsla?\(\s*[\d.]+\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(?:,\s*[\d.]+%?\s*)?\)/g;
/** прозрачный — только rgba()/hsla() с альфой 0 (rgb()/hsl() без альфы — это чёрный/белый, не прозрачность) */
function isTransparentColor(token: string): boolean {
    return /^(?:rgba|hsla)\(/.test(token) && /,\s*0(?:\.0+)?\)$/.test(token);
}
/** строка — присвоение sass-переменной `$name: <цвет>` (палитра-механизм, не хардкод) */
const VARIABLE_DEF_RE = /^\s*\$[\w-]+\s*:/;

/**
 * CSS-5: цвета — только из палитры (sass-переменные), хардкод HEX/rgb()/hsl() в стилях не используем.
 * Не ругаемся на: объявления палитры `$name: #hex` и прозрачный цвет (rgba(...,0)).
 */
export function detectCss5(
    _program: import("@typescript-eslint/typescript-estree").TSESTree.Program | null,
    sourceText: string,
    filePath: string,
    _state: import("./helpers.js").DetectorState = {},
): Finding[] {
    const findings: Finding[] = [];
    const lines = sourceText.split("\n");

    lines.forEach((rawLine, idx) => {
        const lineNo = idx + 1;
        const line = rawLine.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "").trim();
        if (line === "") return;
        if (VARIABLE_DEF_RE.test(line)) return; // строка палитры

        const scan = (re: RegExp): void => {
            re.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = re.exec(line))) {
                const token = m[0].trim();
                if (isTransparentColor(token)) continue;
                findings.push(
                    makeFinding(
                        "CSS-5",
                        "MUST",
                        `Захардкоженный цвет "${token}" — цвета берём из палитры (sass-переменные), без хардкода в стилях (CSS-5)`,
                        filePath,
                        { start: { line: lineNo, column: 0 } },
                    ),
                );
            }
        };
        scan(HEX_COLOR_RE);
        scan(FUNC_COLOR_RE);
    });

    return findings;
}
