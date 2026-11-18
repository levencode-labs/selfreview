import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding } from "./helpers.js";

export function isStaticTemplateLiteral(node: TSESTree.TemplateLiteral): boolean {
    return node.expressions.length === 0 && node.quasis.length === 1;
}

/** Преобразование `...` (без expressions) -> '...' — локально, однозначно, не меняет runtime-семантику. */
function templateToLiteralFix(node: TSESTree.TemplateLiteral, sourceText: string): { range: [number, number]; text: string } {
    const cooked = node.quasis[0].value.cooked ?? "";
    return { range: [node.range[0], node.range[1]], text: JSON.stringify(cooked) };
}

/**
 * REDUX-4 — строковые енамы/литералы в createAction и поле type, без template-строк.
 * Статический template literal (без expressions) безопасно превращается в строковый литерал — safe-fix.
 * Template literal с выражениями — только замечание (фикс небезопасен: динамическая строка).
 */
export function detectRedux4(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    walk(program, (n) => {
        if (n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === "createAction") {
            const first = n.arguments[0];
            if (!first || first.type !== "TemplateLiteral") return;
            const fixable = isStaticTemplateLiteral(first);
            findings.push(
                makeFinding(
                    "REDUX-4",
                    "MUST",
                    `createAction с template-строкой — используй строковый литерал (REDUX-4)`,
                    filePath,
                    { start: { line: first.loc.start.line, column: first.loc.start.column } },
                    fixable ? templateToLiteralFix(first, sourceText) : undefined,
                ),
            );
        }
        if (n.type === "Property" && n.key.type === "Identifier" && n.key.name === "type" && n.value.type === "TemplateLiteral") {
            const fixable = isStaticTemplateLiteral(n.value);
            findings.push(
                makeFinding(
                    "REDUX-4",
                    "MUST",
                    `Поле "type" экшена задано template-строкой — используй строковый литерал/енам (REDUX-4)`,
                    filePath,
                    { start: { line: n.value.loc.start.line, column: n.value.loc.start.column } },
                    fixable ? templateToLiteralFix(n.value, sourceText) : undefined,
                ),
            );
        }
    });

    return findings;
}
