import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding, type DetectorState } from "./helpers.js";
import { renderAnalysis, usageRange, unwrap } from "./renderAnalysis.js";

/** Consumer ownership complements FS-6 declaration naming; all new conventions are advisory. */
export function detectReact16(program: TSESTree.Program | null, _text: string, file: string, state: DetectorState = {}): Finding[] {
    if (!program || !file.endsWith(".tsx") || state.isDeleted) return [];
    const a = renderAnalysis(program);
    const findings: Finding[] = [];
    const directory = file.replace(/\\/g, "/").split("/").slice(-2, -1)[0];
    for (const { name, fn } of a.components) {
        const hooks = a.calls(fn).filter(n => ["useSelector", "useSelectorBuilder"].includes(a.hook(n.callee, n) ?? ""));
        const report = (n: TSESTree.Node, message: string) => findings.push(makeFinding("REACT-16", "SHOULD",
            message + " (REACT-16)", file, usageRange(n, state)));
        // Attach count to every participating usage: a newly added first subscription must not be lost.
        if (hooks.length > 1) for (const n of hooks) report(n, 'Компонент "' + name + '" читает ' + hooks.length + ' подписки — соберите одну собственную ViewModel');
        const owners = new Set([name]);
        // Explicit internal render convention, anchored to the owning directory, never just basename.
        const internal = /^(.*)(Inner|Content|Container)$/.exec(name);
        if (internal && internal[1] === directory) owners.add(internal[1]);
        if (name === "Container") continue; // responsibility needs explicit project context
        for (const n of hooks) {
            const arg = n.arguments[0];
            if (!arg) continue;
            const target = unwrap(arg);
            const info = a.imported(target.type === "CallExpression" ? target.callee : target, n);
            if (!info || !info.source.startsWith(".") || !/selectors/i.test(info.source)) continue;
            const model = /^(?:get|makeGet|make)([A-Z][A-Za-z0-9]*)ViewModel$/.exec(info.name);
            if (!model) report(n, 'Селектор "' + info.name + '" не имеет компонентной ViewModel-формы; ожидается get' + name + 'ViewModel или makeGet' + name + 'ViewModel');
            else if (!owners.has(model[1])) report(n, 'Селектор "' + info.name + '" относится к "' + model[1] + '", компонент "' + name + '" должен получать собственную ViewModel');
        }
    }
    return findings;
}
