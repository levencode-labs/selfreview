import type { TSESTree as T } from "@typescript-eslint/typescript-estree";
import { walk } from "../ast/walk.js";
import { bindingNames, isFunction } from "./renderAnalysis.js";

const METHODS = new Set(["map", "filter", "every", "some", "reduce", "reduceRight", "find", "findIndex", "includes", "has", "get", "toSorted", "toReversed", "slice", "concat", "toLowerCase", "toUpperCase", "trim"]);
/** Conservative pure-data candidate: no JSX, arbitrary calls, render callbacks or mutations. */
export function projection(expression: T.Node, sources: Set<string>) {
    let depends = false, operation = false, pure = true;
    const parents = new Map<T.Node, T.Node | null>();
    walk(expression, (n, parent) => parents.set(n, parent));
    const boundInCallback = (n: T.Identifier) => {
        for (let p = parents.get(n); p; p = parents.get(p)) {
            if (isFunction(p) && p.params.some(param => bindingNames(param).includes(n.name))) return true;
        }
        return false;
    };
    walk(expression, (n, parent) => {
        if (n.type === "Identifier" && sources.has(n.name) && !boundInCallback(n)
            && !(parent?.type === "MemberExpression" && parent.property === n && !parent.computed)
            && !(parent?.type === "Property" && parent.key === n && !parent.computed && !parent.shorthand)) depends = true;
        if (["JSXElement", "JSXFragment", "AssignmentExpression", "UpdateExpression", "AwaitExpression", "YieldExpression", "ThisExpression"].includes(n.type)) pure = false;
        if (n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression") {
            if (parent?.type !== "CallExpression" || parent.callee.type !== "MemberExpression"
                || parent.callee.property.type !== "Identifier" || !METHODS.has(parent.callee.property.name)) pure = false;
        }
        if (n.type === "Property" && n.key.type === "Identifier" && /^(render|on[A-Z])/.test(n.key.name)) pure = false;
        if (n.type === "NewExpression") {
            if (n.callee.type !== "Identifier" || !["Set", "Map"].includes(n.callee.name)) pure = false;
            else operation = true;
        }
        if (n.type === "CallExpression") {
            if (n.callee.type === "MemberExpression" && n.callee.property.type === "Identifier"
                && ["map", "filter", "reduce", "reduceRight", "find", "some", "every"].includes(n.callee.property.name)
                && n.arguments[0]?.type === "Identifier") pure = false;
            if (n.callee.type !== "MemberExpression" || n.callee.computed || n.callee.property.type !== "Identifier" || !METHODS.has(n.callee.property.name)) pure = false;
            else operation = true;
        }
    });
    return { depends, operation, pure };
}
