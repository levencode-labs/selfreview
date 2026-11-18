import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";

const ROOT_SELECTOR_RE = /(^|[^\w-]):root\b/;
const CUSTOM_PROPERTY_RE = /--[a-zA-Z][\w-]*\s*:/;

/**
 * CSS-2: custom properties в :root пока не используем, сидим на sass-переменных.
 * Узкий однозначно детектируемый срез правила (остальное требует знать имя компонента).
 */
export function detectCss2(
    _program: import("@typescript-eslint/typescript-estree").TSESTree.Program | null,
    sourceText: string,
    filePath: string,
    _state: import("./helpers.js").DetectorState = {},
): Finding[] {
    const findings: Finding[] = [];
    const lines = sourceText.split("\n");
    let insideRoot = false;
    let rootDepth = 0;

    lines.forEach((rawLine, idx) => {
        const line = rawLine.replace(/\/\/.*$/, "");
        const opensHere = !insideRoot && ROOT_SELECTOR_RE.test(line) && line.includes("{");
        if (opensHere) {
            insideRoot = true;
            rootDepth = 1;
        }
        if (!insideRoot) return;
        rootDepth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
        if (CUSTOM_PROPERTY_RE.test(line)) {
            findings.push(
                makeFinding(
                    "CSS-2",
                    "SHOULD",
                    `Custom property �? :root �?" �?����: �<�?�>�?�+���>�?�?�<�� �?�?�?���?�'�?�� (:root) ���?��� �?�� ��?���?�>�?���?��?, �?��?��? �?�� sass-����?��?��?�?�<�:�> (CSS-2)`,
                    filePath,
                    { start: { line: idx + 1, column: 0 } },
                ),
            );
        }
        if (rootDepth <= 0) insideRoot = false;
    });

    return findings;
}
