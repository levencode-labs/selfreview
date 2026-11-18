import type { TSESTree as T } from "@typescript-eslint/typescript-estree";
import { unwrap } from "./renderAnalysis.js";

/** Literal trees only: identifiers, computed keys, spreads, functions and ReactNode are unknown. */
export function literalTree(node: T.Node | null): boolean {
    if (!node) return false;
    const n = unwrap(node);
    if (n.type === "Literal") return n.value === null || ["string", "number", "boolean"].includes(typeof n.value);
    if (n.type === "UnaryExpression" && ["-", "+", "!"].includes(n.operator)) return literalTree(n.argument);
    if (n.type === "ArrayExpression") return n.elements.every(e => e !== null && literalTree(e));
    if (n.type === "ObjectExpression") return n.properties.every(p => p.type === "Property" && !p.computed && !p.method && p.kind === "init" && literalTree(p.value));
    return false;
}
export function moduleConstants(program: T.Program) {
    return program.body.flatMap(s => {
        const d = s.type === "ExportNamedDeclaration" ? s.declaration : s;
        return d?.type === "VariableDeclaration" && d.kind === "const" ? d.declarations : [];
    });
}
export function constantsFile(file: string) {
    return /(?:^|\/)constants(?:\/|\.tsx?$)/.test(file.replace(/\\/g, "/"));
}
