import { inProfileDirectory, profile } from "../profile.js";
import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";
import { renderAnalysis } from "./renderAnalysis.js";

const LOCAL_STATE_HOOKS = new Set(["useState", "useReducer"]);

/** MVVM-5 — локальный стейт компонента (часть про useState/useReducer); отключён для shared/legacy-ui. */
export function detectMvvm5(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    if (filePath.includes("/shared/") || inProfileDirectory(filePath, profile.sharedUiDirectory)) return [];

    const findings: Finding[] = [];
    const analysis = renderAnalysis(program);
    walk(program, (n) => {
        if (n.type !== "CallExpression") return;
        const imported = analysis.imported(n.callee);
        const name = imported?.source === "react" ? imported.name : analysis.globalReference(n.callee)?.replace(/^React\./, "");
        if (!name || !LOCAL_STATE_HOOKS.has(name)) return;
        findings.push(
            makeFinding(
                "MVVM-5",
                "SHOULD",
                `${name}(...) — локальный стейт компонента. По умолчанию стейт держим в redux (слайс + Container); если это общий компонент — исключение, обсуждали в частном порядке (MVVM-5)`,
                filePath,
                nodeStartRange(n),
            ),
        );
    });

    return findings;
}
