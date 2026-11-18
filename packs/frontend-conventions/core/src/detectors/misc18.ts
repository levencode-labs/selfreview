import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { walk } from "../ast/walk.js";

const INDEX_LETTERS = new Set(["i", "j", "k"]);
const SORT_METHODS = new Set(["sort", "toSorted"]);

function isIndexLetter(name: string): boolean {
    return INDEX_LETTERS.has(name);
}

/** Имя типа параметра, если это ссылка на тип (MouseEvent, React.MouseEvent, ...). */
function typeRefName(param: TSESTree.Identifier): string | null {
    const ta = param.typeAnnotation?.typeAnnotation;
    if (!ta || ta.type !== "TSTypeReference") return null;
    const tn = ta.typeName;
    if (tn.type === "Identifier") return tn.name;
    if (tn.type === "TSQualifiedName" && tn.right.type === "Identifier") return tn.right.name;
    return null;
}

/** Параметр — событие (заканчивается на Event): MouseEvent, ChangeEvent, KeyboardEvent, ... */
function isEventParam(param: TSESTree.Identifier): boolean {
    const name = typeRefName(param);
    return name !== null && /Event$/.test(name);
}

/** Функция — компаратор Array.sort((a, b) => ...). */
function isSortComparator(fn: TSESTree.Node, parent: TSESTree.Node | null): boolean {
    if (parent?.type !== "CallExpression") return false;
    const callee = parent.callee;
    return (
        callee.type === "MemberExpression" &&
        callee.property.type === "Identifier" &&
        SORT_METHODS.has(callee.property.name)
    );
}

/**
 * MISC-18: не называем переменные одной буквой (q, t, a, b) — имя должно читаться.
 * Исключения:
 *   - `_` (игнорируемое значение / lodash);
 *   - i/j/k — традиционные индексы/счётчики (форы, индексы массивов), x/y/z — только координаты не трогаем
 *     (не входит в срез правила).
 * Флагаются объявления/параметры длиной ровно в один символ в .ts/.tsx (кроме .d.ts).
 * Severity — MUST: одно-буквенные имена — почти всегда отсутствие смысла.
 */
export function detectMisc18(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    _state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!program || !/\.(ts|tsx)$/.test(filePath) || filePath.endsWith(".d.ts")) return [];

    const findings: Finding[] = [];
    const eventHandlers = new Set<TSESTree.Node>();
    const report = (name: string, what: string, loc: { line: number; column: number }): void => {
        if (name.length !== 1) return;
        if (name === "_") return;
        if (isIndexLetter(name)) return; // i/j/k — индексы/счётчики, исключение по договорённости
        findings.push(
            makeFinding(
                "MISC-18",
                "MUST",
                `Переменная "${name}" (${what}) — одна буква: назови по смыслу (исключения: _, i/j/k, e-событие, a/b в sort()) (MISC-18)`,
                filePath,
                { start: { line: loc.line, column: loc.column } },
            ),
        );
    };

    const reportParam = (
        param: TSESTree.Identifier,
        fn: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration,
        parent: TSESTree.Node | null,
    ): void => {
        const name = param.name;
        if (name.length !== 1 || name === "_" || isIndexLetter(name)) return;
        if (isEventParam(param)) return; // (e: MouseEvent<...>) и подобные — параметр события
        if (name === "e" && eventHandlers.has(fn)) return; // onClick={(e) => ...}
        if ((name === "a" || name === "b") && isSortComparator(fn, parent)) return; // (a, b) => ... в sort()
        report(name, "параметр", param.loc?.start ?? { line: 1, column: 0 });
    };

    walk(program, (node, parent) => {
        switch (node.type) {
            case "JSXAttribute":
                if (node.name.type === "JSXIdentifier" && /^on[A-Z]/.test(node.name.name) && node.value?.type === "JSXExpressionContainer") {
                    eventHandlers.add(node.value.expression);
                }
                return;
            case "VariableDeclarator": {
                if (node.id.type !== "Identifier") return;
                report(node.id.name, "объявление", node.id.loc?.start ?? { line: 1, column: 0 });
                return;
            }
            case "CatchClause": {
                if (!node.param || node.param.type !== "Identifier") return;
                report(node.param.name, "параметр catch", node.param.loc?.start ?? { line: 1, column: 0 });
                return;
            }
            case "FunctionDeclaration":
            case "FunctionExpression": {
                if (node.id?.type === "Identifier") report(node.id.name, "имя функции", node.id.loc?.start ?? { line: 1, column: 0 });
                for (const param of node.params) {
                    if (param.type !== "Identifier") continue;
                    reportParam(param, node, parent);
                }
                return;
            }
            case "ArrowFunctionExpression": {
                for (const param of node.params) {
                    if (param.type !== "Identifier") continue;
                    reportParam(param, node, parent);
                }
                return;
            }
            default:
                return;
        }
    });

    return findings;
}
