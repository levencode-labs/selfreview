import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

const EVENT_PROP_RE = /^on[A-Z]/;

/** Follow only expressions selecting a handler; factory arguments and function bodies are not handlers. */
function inlineHandlers(node: TSESTree.Node): TSESTree.Node[] {
    switch (node.type) {
        case "ArrowFunctionExpression":
        case "FunctionExpression":
            return [node];
        case "ConditionalExpression":
            return [...inlineHandlers(node.consequent), ...inlineHandlers(node.alternate)];
        case "LogicalExpression":
            return [...inlineHandlers(node.left), ...inlineHandlers(node.right)];
        case "TSAsExpression":
        case "TSTypeAssertion":
        case "TSNonNullExpression":
        case "TSSatisfiesExpression":
            return inlineHandlers(node.expression);
        default:
            return [];
    }
}

/**
 * REACT-7 — инлайн-стрелочные функции в JSX-хендлерах on*.
 * Report-only: именованный обработчик требует именования и, часто, переноса логики — не механический фикс.
 */
export function detectReact7(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    walk(program, (n) => {
        if (n.type !== "JSXAttribute" || n.name.type !== "JSXIdentifier") return;
        if (!EVENT_PROP_RE.test(n.name.name)) return;
        const value = n.value;
        if (!value || value.type !== "JSXExpressionContainer") return;
        const expr = value.expression;
        for (const handler of inlineHandlers(expr)) {
            findings.push(
                makeFinding(
                    "REACT-7",
                    "MUST",
                    `Проп "${n.name.name}" — инлайн-стрелочная функция. Вынеси в именованный обработчик (создаётся заново на каждый рендер, часто прячет логику, которая должна жить в хелпере/ViewModel) (REACT-7)`,
                    filePath,
                    nodeStartRange(handler),
                ),
            );
        }
    });

    return findings;
}
