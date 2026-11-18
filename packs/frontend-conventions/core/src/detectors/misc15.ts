import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { walk } from "../ast/walk.js";

/**
 * MISC-15: магические числа в компонентах — выноси в constants.
 * Флагаются целочисленные литералы от |2| и выше, участвующие в вычислениях
 * (BinaryExpression) или в ветках ConditionalExpression — например `6 + (showExtraColumns ? 2 : 0)`.
 * Исключения (нормальные ситуации, шум не нужен):
 *   - 0 и ±1 — базовые значения и инкременты/декременты (`page - 1`, `index + 1`, `items.length - 1`);
 *   - числа в JSX-атрибутах, литералах массивов/объектов и т.п. — вне арифметики.
 * Severity — SHOULD: ±2 и больше повод задуматься, но не блокер.
 */
export function detectMisc15(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    _state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!program || !/\.tsx$/.test(filePath)) return [];

    const findings: Finding[] = [];
    walk(program, (n, parent) => {
        if (n.type !== "Literal" || typeof n.value !== "number") return;
        if (!Number.isInteger(n.value)) return;
        const v = n.value;
        if (v >= -1 && v <= 1) return; // 0/±1: базовые значения и инкременты/декременты

        const inBinary = parent && parent.type === "BinaryExpression";
        const inConditional = parent && parent.type === "ConditionalExpression";
        if (!inBinary && !inConditional) return;
        if (!n.loc) return;

        findings.push(
            makeFinding(
                "MISC-15",
                "SHOULD",
                `Магическое число ${v} в компоненте — вынеси в constants (неочевидно, что это значит; ±1/0 — ок, а здесь нужен комментарий или константа) (MISC-15)`,
                filePath,
                { start: { line: n.loc.start.line, column: n.loc.start.column } },
            ),
        );
    });

    return findings;
}
