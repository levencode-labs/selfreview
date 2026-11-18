import { profile } from "../profile.js";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";

const TYPOGRAPHY_RE = /(?:^|[;{])\s*(font-size|line-height)\s*:/;
const MODULE_RE = /\.module\.(css|scss)$/;

/**
 * CSS-6: в *.module.css не объявляем font-size — используем токены типографики (t12/t14/t16).
 * Срезание шрифта в компоненте — «типовое нестандартное решение»: каждый раз надо думать,
 * поэтому запрещаем font-size напрямую (исключая определения sass-mixin'ов — там токены дизайн-системы).
 */
export function detectCss6(
    _program: import("@typescript-eslint/typescript-estree").TSESTree.Program | null,
    sourceText: string,
    filePath: string,
    _state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!MODULE_RE.test(filePath)) return [];

    const findings: Finding[] = [];
    const lines = sourceText.split("\n");
    let depth = 0;
    let mixinDepth = -1; // глубина, на которой открыт @mixin; -1 — вне mixin

    lines.forEach((rawLine, idx) => {
        const lineNo = idx + 1;
        const line = rawLine.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");

        // Открытие нового @mixin (головная строка) — внутри него font-size разрешён (дизайн-токены).
        if (mixinDepth === -1 && /^\s*@mixin\b/.test(line.trim()) && line.includes("{")) {
            const opens = (line.match(/\{/g) ?? []).length;
            const closes = (line.match(/\}/g) ?? []).length;
            depth += opens - closes;
            mixinDepth = depth;
            return;
        }

        const inMixin = mixinDepth !== -1 && depth >= mixinDepth;
        const property = TYPOGRAPHY_RE.exec(line)?.[1];
        if (property && !inMixin) {
            findings.push(
                makeFinding(
                    "CSS-6",
                    "MUST",
                    `${property} в CSS-модуле — используй ${profile.typography} (CSS-6)`,
                    filePath,
                    { start: { line: lineNo, column: 0 } },
                ),
            );
        }

        const opens = (line.match(/\{/g) ?? []).length;
        const closes = (line.match(/\}/g) ?? []).length;
        depth += opens - closes;
        if (mixinDepth !== -1 && depth < mixinDepth) mixinDepth = -1;
        if (depth < 0) depth = 0;
    });

    return findings;
}
