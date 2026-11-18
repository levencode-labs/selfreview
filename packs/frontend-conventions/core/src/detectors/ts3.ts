import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

import { renderAnalysis } from "./renderAnalysis.js";

const CONSOLE_METHODS = new Set(["console.log", "console.debug"]);

/** TS-3 — забытые console.log/console.debug (мёртвый код). Автофикса нет: удаление строки рискованно. */
export function detectTs3(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];
    const analysis = renderAnalysis(program);

    walk(program, (n) => {
        if (n.type !== "CallExpression") return;
        const target = analysis.globalReference(n.callee);
        if (!target || !CONSOLE_METHODS.has(target)) return;
        findings.push(
            makeFinding(
                "TS-3",
                "MUST",
                `${target}(...) остался в коде — убери (TS-3)`,
                filePath,
                nodeStartRange(n),
            ),
        );
    });

    return findings;
}
