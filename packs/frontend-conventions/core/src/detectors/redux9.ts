import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { walk, basename, stripExt } from "../ast/walk.js";
import { isFunction, renderAnalysis, staticMemberName, unwrap, usageRange } from "./renderAnalysis.js";

/**
 * REDUX-9: в сагах API вызываем только через fetchData, а не напрямую.
 * Прямой вызов = эффект call() из redux-saga, у которого первый аргумент — сам API:
 * либо MemberExpression (CatalogApi.getCatalogSettings), либо символ, импортированный
 * из API-модуля. Срабатывает только на файлах саг (saga.ts / sagas.ts, также .tsx, и sagas/...).
 */
export function detectRedux9(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    _state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!program) return [];

    const normalizedPath = filePath.replace(/\\/g, "/");
    if (!/(^|\/)(saga|sagas)\.tsx?$/.test(normalizedPath) && !/\/sagas\//.test(normalizedPath)) return [];

    const apiLocals = new Set<string>();
    for (const stmt of program.body) {
        if (stmt.type !== "ImportDeclaration" || stmt.importKind === "type" || typeof stmt.source.value !== "string") continue;
        const base = stripExt(basename(stmt.source.value.replace(/\\/g, "/")));
        const isApiModule =
            /Api$/.test(base) ||
            /\/api\//i.test(stmt.source.value) ||
            /\/Controllers\//i.test(stmt.source.value) ||
            /[Aa]pi[^/]*\.tsx?$/.test(base);
        if (!isApiModule) continue;
        for (const spec of stmt.specifiers) {
            if (spec.type !== "ImportSpecifier" || spec.importKind !== "type") apiLocals.add(spec.local.name);
        }
    }
    if (apiLocals.size === 0) return [];

    const analysis = renderAnalysis(program);
    function apiName(target: TSESTree.Node): string | undefined {
        target = unwrap(target);
        if (target.type === "Identifier" && apiLocals.has(target.name) && analysis.imported(target)) return target.name;
        if (target.type === "MemberExpression") {
            const name = apiName(target.object);
            if (name) return name + "." + (staticMemberName(target.property, target.computed) ?? "[…]");
        }
        return undefined;
    }
    function boundApi(context: TSESTree.Node | null | undefined, fn: TSESTree.Node | null | undefined) {
        if (!fn) return;
        const name = context && apiName(context);
        const method = staticMemberName(fn, true);
        return name && method ? name + "." + method : apiName(fn);
    }
    const findings: Finding[] = [];
    walk(program, (n) => {
        if (n.type !== "CallExpression") return;
        const effect = analysis.imported(n.callee);
        const call = effect?.source === "redux-saga/effects" && effect.name === "call";
        // shortcut: keep bare call in legacy snippets without imports, require origin once an import exists.
        if (!call && analysis.globalReference(n.callee) !== "call") return;
        if (!n.arguments[0]) return;
        const first = unwrap(n.arguments[0]);

        let apiRef = apiName(first);
        if (isFunction(first)) {
            const refs = new Set<string>();
            for (const node of analysis.calls(first)) {
                const name = apiName(node.callee);
                if (name) refs.add(name);
            }
            if (refs.size) apiRef = "callback: " + [...refs].join(", ");
        } else if (first.type === "ArrayExpression") {
            apiRef = boundApi(first.elements[0], first.elements[1]);
        } else if (first.type === "ObjectExpression") {
            const fields = first.properties.filter(p => p.type === "Property");
            const field = (name: string) => fields.find(p => staticMemberName(p.key, p.computed) === name)?.value;
            apiRef = boundApi(field("context"), field("fn"));
        }
        if (!apiRef) return;

        findings.push(
            makeFinding(
                "REDUX-9",
                "MUST",
                `Прямой вызов API: yield call(${apiRef}, ...) — в сагах API вызываем через fetchData({ action: () => ... }), а не напрямую (REDUX-9)`,
                filePath,
                usageRange(n, _state),
            ),
        );
    });

    return findings;
}
