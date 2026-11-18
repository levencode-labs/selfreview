import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

function topLevelCandidates(program: TSESTree.Program): { id: TSESTree.Identifier; init: TSESTree.Node }[] {
    const result: { id: TSESTree.Identifier; init: TSESTree.Node }[] = [];
    for (const stmt of program.body) {
        const decl = stmt.type === "ExportNamedDeclaration" ? stmt.declaration : stmt;
        if (decl?.type === "FunctionDeclaration" && decl.id) result.push({ id: decl.id, init: decl });
        if (decl?.type === "VariableDeclaration") for (const d of decl.declarations) {
            if (d.id.type === "Identifier" && d.init) result.push({ id: d.id, init: d.init });
        }
    }
    return result;
}

/** REDUX-1 — типизируй sagaSelectors (явный возвращаемый тип). */
export function detectRedux1(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    for (const { id, init } of topLevelCandidates(program)) {
        let fn = init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression" || init.type === "FunctionDeclaration" ? init : null;
        if (!fn && /sagas?Selectors\.ts$/i.test(filePath) && init.type === "CallExpression"
            && init.callee.type === "Identifier" && init.callee.name === "createSelector") {
            const output = init.arguments[init.arguments.length - 1];
            if (output?.type === "ArrowFunctionExpression" || output?.type === "FunctionExpression") fn = output;
        }
        if (!fn) continue;
        if (fn.returnType) continue;
        findings.push(
            makeFinding(
                "REDUX-1",
                "SHOULD",
                `"${id.name}" в sagaSelectors без явного возвращаемого типа — если изменится модель контроллера, узнать об этом на этапе компиляции не получится (REDUX-1)`,
                filePath,
                nodeStartRange(id),
            ),
        );
    }

    return findings;
}
