import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { renderAnalysis, unwrap, usageRange } from "./renderAnalysis.js";
import { selectorFactoryResolver } from "./selectorFactories.js";

/**
 * REACT-10: make*ViewModel подключается через useSelectorBuilder, а не useSelector(make...()).
 * Фабрика вида `export const makeGetItemViewModel = () => createSelector(...)` (MVVM-4) при
 * вызове `useSelector(makeGetItemViewModel())` создаёт НОВЫЙ селектор на каждый рендер —
 * подписка пересоздаётся. Для фабрик view-моделей в компоненте есть useSelectorBuilder.
 * Детект: непосредственное использование в render; фабрика подтверждается декларацией
 * createSelector. Неразрешимые декларации unknown, независимо от make/get имени.
 */
export function detectReact10(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!program || !/\.tsx$/.test(filePath) || state.isDeleted) return [];
    const a = renderAnalysis(program);
    const factory = selectorFactoryResolver(program, filePath, state.readSource);
    const findings: Finding[] = [];
    for (const { fn } of a.components) for (const n of a.calls(fn)) {
        if (a.hook(n.callee, n) !== "useSelector") continue;
        const arg = n.arguments[0];
        if (!arg) continue;
        const value = unwrap(arg);
        const callee = value.type === "CallExpression" ? value.callee : value;
        if (callee.type !== "Identifier" || a.shadowed(callee.name, n, true)) continue;
        const info = a.imported(callee, n);
        const name = info?.name ?? callee.name;
        const evidence = factory(callee.name);
        if (evidence !== true) continue;
        findings.push(makeFinding("REACT-10", "SHOULD",
            'Фабрику селектора "' + name + '" подключай через useSelectorBuilder с props; ' +
            (value.type === "CallExpression" ? 'прямой вызов в render создаёт новый селектор' : 'фабрика передана вместо готового экземпляра селектора') +
            ' (REACT-10)',
            filePath, usageRange(n, state)));
    }
    return findings;
}
