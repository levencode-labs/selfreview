import { profile } from "../profile.js";
import type { TSESTree as T } from "@typescript-eslint/typescript-estree";
import { walk } from "../ast/walk.js";
import type { DetectorState } from "./helpers.js";

export type RenderFunction = T.ArrowFunctionExpression | T.FunctionExpression | T.FunctionDeclaration;
export function isFunction(n: T.Node): n is RenderFunction {
    return n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression" || n.type === "FunctionDeclaration";
}
export function unwrap(n: T.Node): T.Node {
    while (n.type === "TSAsExpression" || n.type === "TSTypeAssertion" || n.type === "TSNonNullExpression"
        || n.type === "TSSatisfiesExpression" || n.type === "ChainExpression") n = n.expression;
    return n;
}
export function bindingNames(n: T.Node): string[] {
    if (n.type === "Identifier") return [n.name];
    if (n.type === "AssignmentPattern") return bindingNames(n.left);
    if (n.type === "RestElement") return bindingNames(n.argument);
    if (n.type === "ObjectPattern") return n.properties.flatMap(p => bindingNames(p.type === "Property" ? p.value : p));
    if (n.type === "ArrayPattern") return n.elements.flatMap(e => e ? bindingNames(e) : []);
    return [];
}

export function staticMemberName(node: T.Node, computed: boolean): string | undefined {
    if (!computed && node.type === "Identifier") return node.name;
    if (node.type === "Literal" && typeof node.value === "string") return node.value;
    if (computed && node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0].value.cooked ?? undefined;
    return undefined;
}

const globalContainers = new Set(["globalThis", "window", "self"]);

/** Per-file lexical import identity; unknown hooks are deliberately outside coverage. */
export function renderAnalysis(program: T.Program) {
    const parents = new Map<T.Node, T.Node | null>();
    const imports = new Map<string, { name: string; source: string; namespace: boolean }>();
    const scopes = new Map<T.Node, Map<string, T.Node>>();
    const isLexicalScope = (n: T.Node) => n.type === "BlockStatement" || n.type === "Program"
        || n.type === "ForStatement" || n.type === "ForInStatement" || n.type === "ForOfStatement" || n.type === "SwitchStatement";
    function declare(owner: T.Node, id: T.Node, binding: T.Node) {
        let names = scopes.get(owner);
        if (!names) scopes.set(owner, names = new Map());
        for (const name of bindingNames(id)) names.set(name, binding);
    }
    walk(program, (node, parent) => {
        parents.set(node, parent);
        if (isFunction(node)) {
            for (const param of node.params) declare(node, param, param);
            if (node.type === "FunctionExpression" && node.id) declare(node, node.id, node);
        }
        if (node.type === "CatchClause" && node.param) declare(node, node.param, node.param);
        if ((node.type === "ClassExpression" || node.type === "ClassDeclaration") && node.id) declare(node, node.id, node);
        if (node.type !== "VariableDeclarator" && node.type !== "FunctionDeclaration" && node.type !== "ClassDeclaration") return;
        const functionScoped = node.type === "VariableDeclarator" && parent?.type === "VariableDeclaration" && parent.kind === "var";
        let owner = parent;
        while (owner && !(functionScoped ? owner.type === "Program" || isFunction(owner) : isLexicalScope(owner))) owner = parents.get(owner) ?? null;
        if (owner && node.id) declare(owner, node.id, node);
    });
    for (const s of program.body) {
        if (s.type !== "ImportDeclaration") continue;
        for (const spec of s.specifiers) {
            if (s.importKind === "type" || (spec.type === "ImportSpecifier" && spec.importKind === "type")) continue;
            imports.set(spec.local.name, { source: String(s.source.value), namespace: spec.type !== "ImportSpecifier",
                name: spec.type === "ImportSpecifier" ? (spec.imported.type === "Identifier" ? spec.imported.name : spec.imported.value) : "*" });
        }
    }
    function localBinding(name: string, at: T.Node, ignoreModule = false): T.Node | undefined {
        for (let scope = parents.get(at); scope; scope = parents.get(scope)) {
            if (ignoreModule && scope.type === "Program") continue;
            const binding = scopes.get(scope)?.get(name);
            if (binding) return binding;
        }
        return undefined;
    }
    function shadowed(name: string, at: T.Node, ignoreModule = false): boolean {
        return localBinding(name, at, ignoreModule) !== undefined;
    }
    function imported(n: T.Node, at: T.Node = n) {
        n = unwrap(n);
        if (n.type === "Identifier") return shadowed(n.name, at) ? undefined : imports.get(n.name);
        if ((n.type === "MemberExpression" && n.object.type === "Identifier")
            || (n.type === "JSXMemberExpression" && n.object.type === "JSXIdentifier")) {
            const info = imports.get(n.object.name);
            const name = n.type === "JSXMemberExpression"
                ? n.property.name
                : staticMemberName(n.property, n.computed);
            if (info?.namespace && name && !shadowed(n.object.name, at)) return { ...info, name };
        }
        return undefined;
    }
    function hook(n: T.Node, at: T.Node = n): string | undefined {
        const info = imported(n, at);
        if (!info) return;
        if (info.source === "react" && ["memo", "forwardRef", "useMemo", "useRef"].includes(info.name)) return info.name;
        if (info.source === "react-redux" && info.name === "useSelector") return info.name;
        if ([profile.legacyUi, profile.appUi].some(p => info.source === p || info.source.startsWith(p + "/")) && info.name === "useSelectorBuilder") return info.name;
        // Relative named imports of the project's builder are supported, arbitrary custom hooks are not.
        if (info.source.startsWith(".") && info.source.endsWith("/useSelectorBuilder") && info.name === "useSelectorBuilder") return info.name;
        return;
    }
    function constBinding(n: T.Identifier) {
        const binding = localBinding(n.name, n);
        if (binding?.type !== "VariableDeclarator" || !binding.init) return;
        const declaration = parents.get(binding);
        if (declaration?.type === "VariableDeclaration" && declaration.kind === "const") return binding;
    }
    function constValue(n: T.Node, seen = new Set<T.Node>()): T.Node {
        n = unwrap(n);
        if (n.type !== "Identifier" || seen.has(n)) return n;
        seen.add(n);
        const binding = constBinding(n);
        return binding?.id.type === "Identifier" && binding.init ? constValue(binding.init, seen) : n;
    }
    function globalReference(n: T.Node, seen = new Set<T.Node>()): string | undefined {
        n = unwrap(n);
        if (seen.has(n)) return;
        seen.add(n);
        if (n.type === "MemberExpression") {
            const base = globalReference(n.object, seen);
            const property = staticMemberName(n.property, n.computed);
            if (base && property) return globalContainers.has(base) ? property : base + "." + property;
        }
        if (n.type !== "Identifier") return;
        const binding = constBinding(n);
        if (!binding?.init) return shadowed(n.name, n) || imports.has(n.name) ? undefined : n.name;
        if (binding.id.type === "Identifier") return globalReference(binding.init, seen);
        if (binding.id.type !== "ObjectPattern") return;
        const property = binding.id.properties.find(p => p.type === "Property" && p.value.type === "Identifier" && p.value.name === n.name);
        if (property?.type !== "Property") return;
        const base = globalReference(binding.init, seen);
        const key = staticMemberName(property.key, property.computed);
        if (base && key) return globalContainers.has(base) ? key : base + "." + key;
        return;
    }
    function nearestFunction(n: T.Node): RenderFunction | undefined {
        for (let p = parents.get(n); p; p = parents.get(p)) if (isFunction(p)) return p;
        return;
    }
    function renderFunction(n: T.Node): RenderFunction | undefined {
        n = unwrap(n);
        if (isFunction(n)) return n;
        if (n.type === "CallExpression" && ["memo", "forwardRef"].includes(hook(n.callee, n) ?? "") && n.arguments[0]) return renderFunction(n.arguments[0]);
        return;
    }
    const components: Array<{ name: string; fn: RenderFunction }> = [];
    for (const s of program.body) {
        const d = s.type === "ExportNamedDeclaration" || s.type === "ExportDefaultDeclaration" ? s.declaration : s;
        if (!d) continue;
        if (d.type === "FunctionDeclaration" && d.id && /^[A-Z]/.test(d.id.name)) components.push({ name: d.id.name, fn: d });
        if (d.type === "VariableDeclaration") for (const v of d.declarations) {
            if (v.id.type !== "Identifier" || !/^[A-Z]/.test(v.id.name) || !v.init) continue;
            const fn = renderFunction(v.init);
            if (fn) components.push({ name: v.id.name, fn });
        }
    }
    function calls(fn: RenderFunction): T.CallExpression[] {
        const result: T.CallExpression[] = [];
        walk(fn.body, n => { if (n.type === "CallExpression" && nearestFunction(n) === fn) result.push(n); });
        return result;
    }
    return { parents, imported, hook, nearestFunction, components, calls, shadowed, localBinding, constValue, globalReference };
}

/** Position on the changed usage, even when only an argument line was added. */
export function usageRange(n: T.Node, state: DetectorState = {}) {
    let start = n.loc.start;
    if (state.addedLines) {
        const line = [...state.addedLines].filter(l => l >= n.loc.start.line && l <= n.loc.end.line).sort((a, b) => a - b)[0];
        if (line !== undefined && line !== start.line) start = { line, column: 0 };
    }
    return { start };
}
