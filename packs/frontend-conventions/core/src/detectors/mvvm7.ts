import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { basename, walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange, type DetectorState } from "./helpers.js";

export function detectMvvm7(program: TSESTree.Program | null, _source: string, path: string, state: DetectorState = {}): Finding[] {
    const findings: Finding[] = [];
    if (state.isDeleted) return findings;
    if (state.isNew && !state.isRenamed) {
        const file = basename(path);
        const firstLine = { start: { line: 1, column: 0 } };
        if (file === "actions.ts" || file === "reducers.ts") {
            findings.push(makeFinding("MVVM-7", "MUST",
                `"${file}" — рукописные actions.ts/reducers.ts DEPRECATED, используй слайс redux-toolkit (MVVM-7)`, path, firstLine));
        }
        if (/\/reducers\//.test(path) && !/\/__tests__\/|\.test\.tsx?$/.test(path)) {
            findings.push(makeFinding("MVVM-7", "MUST",
                "Новый файл в папке reducers/ — этот подход DEPRECATED, переходи на слайсы redux-toolkit (MVVM-7)", path, firstLine));
        }
    }
    const handwritten = detectMvvm7ManualRootReducer(program, path).filter(finding =>
        state.isNew || !state.addedLines || state.addedLines.has(finding.line ?? 0));
    return [...findings, ...handwritten, ...detectMvvm7BuildReducer(program, path)];
}

function findReturnedObject(fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): TSESTree.ObjectExpression | null {
    if (fn.body.type === "ObjectExpression") return fn.body;
    if (fn.body.type !== "BlockStatement") return null;
    for (const stmt of fn.body.body) {
        if (stmt.type === "ReturnStatement" && stmt.argument?.type === "ObjectExpression") return stmt.argument;
    }
    return null;
}

/**
 * MVVM-7 (AST-часть): корневой редьюсер вручную спредит стейт и дёргает вложенный редьюсер —
 * reduceReducers с функцией-спредом (MUST), плюс buildReducer (SHOULD). Чистое AST-сканирование.
 */
export function detectMvvm7ManualRootReducer(program: TSESTree.Program | null, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    walk(program, (n) => {
        if (n.type !== "CallExpression" || n.callee.type !== "Identifier" || n.callee.name !== "reduceReducers") return;
        for (const arg of n.arguments) {
            const fn = arg.type === "ArrowFunctionExpression" || arg.type === "FunctionExpression" ? arg : null;
            if (!fn) continue;
            const obj = findReturnedObject(fn);
            if (!obj) continue;
            const hasSpread = obj.properties.some((p) => p.type === "SpreadElement");
            const hasNestedReducerCall = obj.properties.some((p) => p.type === "Property" && p.value.type === "CallExpression");
            if (!hasSpread || !hasNestedReducerCall) continue;
            findings.push(
                makeFinding(
                    "MVVM-7",
                    "MUST",
                    `Корневой редьюсер вручную спредит стейт и дёргает вложенный редьюсер как функцию — используй combineReducers/combineReducer вместо ручной сборки (MVVM-7)`,
                    filePath,
                    nodeStartRange(fn),
                ),
            );
        }
    });

    return findings;
}

export function detectMvvm7BuildReducer(program: TSESTree.Program | null, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    walk(program, (n) => {
        if (n.type !== "CallExpression" || n.callee.type !== "Identifier" || n.callee.name !== "buildReducer") return;
        findings.push(
            makeFinding(
                "MVVM-7",
                "SHOULD",
                `buildReducer(...) — менее предпочтительный вариант; используй buildReducer только если задача не решается через combineReducers/reduceReducers (MVVM-7)`,
                filePath,
                nodeStartRange(n),
            ),
        );
    });

    return findings;
}
