import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

/** EB-1 — ErrorBoundary оборачиваем ХОКом, не через connect (ломает типы в tsx). */
export function detectEb1(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    walk(program, (n) => {
        if (n.type !== "CallExpression") return;
        if (n.callee.type !== "CallExpression" || n.callee.callee.type !== "Identifier" || n.callee.callee.name !== "connect") return;
        const arg = n.arguments[0];
        if (!arg || arg.type !== "Identifier" || !/ErrorBoundary/i.test(arg.name)) return;
        findings.push(
            makeFinding(
                "EB-1",
                "MUST",
                `connect(...)( ${arg.name} ) — ErrorBoundary оборачиваем ХОКом, не через connect (ломает типы в tsx) (EB-1)`,
                filePath,
                nodeStartRange(n),
            ),
        );
    });

    return findings;
}
