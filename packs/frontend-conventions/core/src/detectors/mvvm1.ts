import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

function isNestedTernary(node: TSESTree.ConditionalExpression): boolean {
    return node.consequent.type === "ConditionalExpression" || node.alternate.type === "ConditionalExpression";
}

/** MVVM-1 — вложенный тернарник внутри JSX-выражения (логика отображения не в селекторе). */
export function detectMvvm1(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    walk(program, (n, parent) => {
        if (n.type !== "ConditionalExpression" || !isNestedTernary(n)) return;
        if (parent?.type !== "JSXExpressionContainer") return;
        findings.push(
            makeFinding(
                "MVVM-1",
                "SHOULD",
                `Вложенный тернарник в JSX — сложнее "a ? b : c", похоже на логику отображения не в том месте; вынеси в селектор (MVVM-1)`,
                filePath,
                nodeStartRange(n),
            ),
        );
    });

    return findings;
}
