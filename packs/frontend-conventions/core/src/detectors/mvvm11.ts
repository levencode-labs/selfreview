import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { walk } from "../ast/walk.js";
import { renderAnalysis, bindingNames, unwrap, isFunction, usageRange } from "./renderAnalysis.js";
import { projection } from "./projections.js";

/**
 * MVVM-11: вариации данных в компоненте (методы массивов прямо на значении useSelector)
 * — рассмотрите собственную ViewModel, включая чистые проекции внутри useMemo.
 * JSX, callbacks событий, React lifecycle и неизвестные вызовы исключены.
 * Severity — SHOULD, эвристика.
 */
export function detectMvvm11(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!program || !/\.tsx$/.test(filePath) || state.isDeleted) return [];
    const a = renderAnalysis(program);
    const findings: Finding[] = [];
    for (const { fn } of a.components) {
        const sources = new Map<string, TSESTree.VariableDeclarator>();
        const declarations: TSESTree.VariableDeclarator[] = [];
        walk(fn.body, n => {
            if (n.type === "VariableDeclarator" && a.nearestFunction(n) === fn) declarations.push(n);
        });
        for (const d of declarations) {
            if (!d.init || a.parents.get(d)?.type !== "VariableDeclaration") continue;
            const declaration = a.parents.get(d) as TSESTree.VariableDeclaration;
            if (declaration.kind !== "const") continue;
            let value = unwrap(d.init);
            if (value.type === "CallExpression" && ["useSelector", "useSelectorBuilder"].includes(a.hook(value.callee, value) ?? "")) {
                for (const name of bindingNames(d.id)) sources.set(name, d);
                continue;
            }
            if (value.type === "CallExpression" && a.hook(value.callee, value) === "useMemo") {
                const callback = value.arguments[0];
                if (!callback || !isFunction(callback) || callback.params.length) continue;
                const body = callback.body;
                const returned = body.type === "BlockStatement"
                    ? (body.body.length === 1 && body.body[0].type === "ReturnStatement" ? body.body[0].argument : null) : body;
                if (!returned) continue;
                value = unwrap(returned);
            }
            // Event queries and callback identities never become render projections.
            if (isFunction(value)) continue;
            const visibleSources = new Set([...sources].filter(([name, binding]) => a.localBinding(name, d) === binding).map(([name]) => name));
            const result = projection(value, visibleSources);
            if (!result.pure || !result.depends) continue;
            for (const name of bindingNames(d.id)) sources.set(name, d);
            if (!result.operation) continue;
            findings.push(makeFinding("MVVM-11", "SHOULD",
                'Чистая проекция данных Redux в компоненте — рассмотрите вычисление в собственной ViewModel, включая useMemo; ReactNode и handlers остаются в View (MVVM-11)',
                filePath, usageRange(d, state)));
        }
    }
    return findings;
}
