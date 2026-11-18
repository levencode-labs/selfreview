import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

function topLevelVarDeclarations(program: TSESTree.Program): TSESTree.VariableDeclarator[] {
    const result: TSESTree.VariableDeclarator[] = [];
    for (const stmt of program.body) {
        const decl =
            stmt.type === "ExportNamedDeclaration" && stmt.declaration?.type === "VariableDeclaration"
                ? stmt.declaration
                : stmt.type === "VariableDeclaration"
                  ? stmt
                  : null;
        if (!decl) continue;
        result.push(...decl.declarations);
    }
    return result;
}

/**
 * MVVM-4 — view-селектор верхнего уровня (createSelector), но вызывается как функция для каждого
 * элемента списка — нужна фабрика createSelector. Эвристика через regex-соседство — report-only.
 */
export function detectMvvm4(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    for (const d of topLevelVarDeclarations(program)) {
        if (d.id.type !== "Identifier" || !d.init) continue;
        const isDirectCreateSelector = d.init.type === "CallExpression" && d.init.callee.type === "Identifier" && d.init.callee.name === "createSelector";
        if (!isDirectCreateSelector) continue;

        const name = d.id.name;
        const usedInMap = new RegExp(`\\.map\\([\\s\\S]{0,200}?\\b${name}\\(`).test(sourceText);
        if (!usedInMap) continue;

        findings.push(
            makeFinding(
                "MVVM-4",
                "SHOULD",
                `"${name}" — createSelector на верхнем уровне модуля, но, похоже, вызывается для каждого элемента списка. Оберни в фабрику: export const make${name[0].toUpperCase()}${name.slice(1)} = () => createSelector(...) (MVVM-4)`,
                filePath,
                nodeStartRange(d),
            ),
        );
    }

    return findings;
}
