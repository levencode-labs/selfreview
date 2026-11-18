import type { TSESTree } from "@typescript-eslint/typescript-estree";

/** Простой рекурсивный обход AST typescript-estree без внешних зависимостей (visitor-keys). */
export function walk(
    node: unknown,
    visit: (n: TSESTree.Node, parent: TSESTree.Node | null) => void,
    parent: TSESTree.Node | null = null,
): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
        for (const item of node) walk(item, visit, parent);
        return;
    }
    const n = node as Record<string, unknown>;
    if (typeof n.type !== "string") return;
    const tsNode = node as TSESTree.Node;
    visit(tsNode, parent);
    for (const key of Object.keys(n)) {
        if (key === "parent" || key === "loc" || key === "range") continue;
        const value = n[key];
        if (value && typeof value === "object") walk(value, visit, tsNode);
    }
}

/** Recognize standard React wrappers without treating arbitrary factory callbacks as components. */
export function componentBody(node: TSESTree.Node): TSESTree.Node | null {
    if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") return node.body;
    if (node.type !== "CallExpression") return null;
    const callee = node.callee;
    const name = callee.type === "Identifier" ? callee.name
        : callee.type === "MemberExpression" && callee.property.type === "Identifier" ? callee.property.name : null;
    if (name !== "memo" && name !== "forwardRef") return null;
    return node.arguments[0] ? componentBody(node.arguments[0]) : null;
}

export function isTsFile(path: string): boolean {
    return /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts");
}

export function isTsxFile(path: string): boolean {
    return /\.tsx$/.test(path);
}

export function basename(path: string): string {
    const parts = path.split("/");
    return parts[parts.length - 1];
}

export function dirname(path: string): string {
    const parts = path.split("/");
    return parts.slice(0, -1).join("/");
}

export function stripExt(name: string): string {
    return name.replace(/\.[^./]+$/, "");
}

export function isCamelCase(name: string): boolean {
    return /^[a-z][a-zA-Z0-9]*$/.test(name);
}

export function isPascalCase(name: string): boolean {
    return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

export function nodeText(sourceText: string, node: { range: [number, number] }): string {
    return sourceText.slice(node.range[0], node.range[1]);
}
