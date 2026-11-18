import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

/** MVVM-10 (AST-часть): createSelector(...) вызван вне папки selectors/ — перенеси селектор туда. */
export function detectMvvm10CreateSelector(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    walk(program, (n) => {
        if (n.type !== "CallExpression" || n.callee.type !== "Identifier" || n.callee.name !== "createSelector") return;
        findings.push(
            makeFinding(
                "MVVM-10",
                "SHOULD",
                `createSelector(...) вне папки selectors/ — перенеси селектор туда (MVVM-10)`,
                filePath,
                nodeStartRange(n),
            ),
        );
    });

    return findings;
}
