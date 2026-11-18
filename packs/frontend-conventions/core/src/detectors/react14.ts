import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { walk } from "../ast/walk.js";

/**
 * REACT-14: useActions({ ...actions }) / useActions({ action1, action2 }) — передавай набор действий
 * напрямую, без фигурных скобок и деструктуризации: useActions(listPageActions).
 * Спреды нескольких наборов допустимы для одного связывания экшенов компонента.
 * Severity — MUST.
 */
export function detectReact14(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    _state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!program || !/\.tsx$/.test(filePath)) return [];

    const findings: Finding[] = [];
    walk(program, (n) => {
        if (n.type !== "CallExpression") return;
        if (n.callee.type !== "Identifier" || n.callee.name !== "useActions") return;
        const arg = n.arguments[0];
        if (!arg || arg.type !== "ObjectExpression") return;
        if (arg.properties.length > 1 && arg.properties.every(prop => prop.type === "SpreadElement")) return;
        if (!n.loc) return;

        findings.push(
            makeFinding(
                "REACT-14",
                "MUST",
                `useActions({ ... }) — передавай объект действий напрямую (useActions(actions)), без фигурных скобок/спреда (REACT-14)`,
                filePath,
                { start: { line: n.loc.start.line, column: n.loc.start.column } },
            ),
        );
    });

    return findings;
}
