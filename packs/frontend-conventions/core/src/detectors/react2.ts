import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

function findDeclaredParamCount(program: TSESTree.Program, name: string): number | null {
    let found: number | null = null;
    walk(program, (n) => {
        if (found !== null) return;
        if (n.type === "FunctionDeclaration" && n.id?.name === name) found = n.params.length;
        if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.id.name === name && n.init) {
            if (n.init.type === "ArrowFunctionExpression" || n.init.type === "FunctionExpression") found = n.init.params.length;
        }
    });
    return found;
}

function isMemoCall(callee: TSESTree.Node): boolean {
    if (callee.type === "Identifier") return callee.name === "memo";
    if (callee.type === "MemberExpression" && callee.property.type === "Identifier") return callee.property.name === "memo";
    return false;
}

/** REACT-2 — React.memo на компоненте без пропсов бесполезен. Report-only: критерии полноценные не AST. */
export function detectReact2(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    walk(program, (n) => {
        if (n.type !== "CallExpression") return;
        if (!isMemoCall(n.callee)) return;
        const arg = n.arguments[0];
        if (!arg) return;

        let paramCount: number | null = null;
        if (arg.type === "ArrowFunctionExpression" || arg.type === "FunctionExpression") {
            paramCount = arg.params.length;
        } else if (arg.type === "Identifier") {
            paramCount = findDeclaredParamCount(program, arg.name);
        }

        if (paramCount !== 0) return;
        findings.push(
            makeFinding(
                "REACT-2",
                "SHOULD",
                `React.memo на компоненте без пропсов — не даёт пользы, ре-рендерится он не из-за смены пропсов (REACT-2)`,
                filePath,
                nodeStartRange(n),
            ),
        );
    });

    return findings;
}
