import { profile } from "../profile.js";
import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding, type DetectorState } from "./helpers.js";
import { renderAnalysis, usageRange } from "./renderAnalysis.js";

export function detectReact17(program: TSESTree.Program | null, _text: string, file: string, state: DetectorState = {}): Finding[] {
    if (!program || !file.endsWith(".tsx") || state.isDeleted) return [];
    const analysis = renderAnalysis(program);
    const findings: Finding[] = [];

    for (const { fn } of analysis.components) {
        const calls = analysis.calls(fn).filter(call => {
            const binding = analysis.imported(call.callee, call);
            return binding?.name === "useActions"
                && binding.source === profile.appUi + "/hooks"
                && call.arguments.length === 1;
        });
        if (calls.length < 2) continue;
        const changed = calls.find(call => [...(state.addedLines ?? [])].some(line => line >= call.loc.start.line && line <= call.loc.end.line));
        findings.push(makeFinding("REACT-17", "SHOULD",
            "Проверьте пересечения экшенов и соберите наборы компонента в одном useActions (REACT-17)",
            file, usageRange(changed ?? calls[0], state)));
    }
    return findings;
}
