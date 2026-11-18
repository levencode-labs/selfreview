import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";
import { staticMemberName } from "./renderAnalysis.js";

const NO_SUFFIX_ASYNC_KEY = /^(fetch|save)[A-Z][A-Za-z0-9]*$/;
const HAS_SUFFIX = /(Begin|Success|Error)$/;

export function findCreateSliceReducersObjects(program: TSESTree.Program): TSESTree.ObjectExpression[] {
    const result: TSESTree.ObjectExpression[] = [];
    walk(program, (n) => {
        if (n.type !== "CallExpression" || n.callee.type !== "Identifier" || n.callee.name !== "createSlice") return;
        const configArg = n.arguments[0];
        if (!configArg || configArg.type !== "ObjectExpression") return;
        for (const prop of configArg.properties) {
            if (prop.type === "Property" && staticMemberName(prop.key, prop.computed) === "reducers" && prop.value.type === "ObjectExpression") {
                result.push(prop.value);
            }
        }
    });
    return result;
}

/** REDUX-6 — асинхронные экшены fetch/save именуются с суффиксом Begin/Success/Error. */
export function detectRedux6(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    for (const reducersObj of findCreateSliceReducersObjects(program)) {
        const keys = new Set(
            reducersObj.properties
                .flatMap(p => p.type === "Property" ? [staticMemberName(p.key, p.computed)] : []),
        );

        for (const prop of reducersObj.properties) {
            if (prop.type !== "Property") continue;
            const key = staticMemberName(prop.key, prop.computed);
            if (!key || !NO_SUFFIX_ASYNC_KEY.test(key) || HAS_SUFFIX.test(key)) continue;
            if (keys.has(`${key}Begin`)) continue;
            findings.push(
                makeFinding(
                    "REDUX-6",
                    "MUST",
                    `Редьюсер "${key}" без суффикса Begin/Success/Error и без отдельного "${key}Begin" — асинхронные экшены именуются fetch[Что]Begin|Success|Error / save[Что][...] (REDUX-6)`,
                    filePath,
                    nodeStartRange(prop),
                ),
            );
        }
    }

    return findings;
}
