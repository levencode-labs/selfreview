import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

/** TS-4 — delete obj[key] → предпочтительна деструктуризация. Report-only (auto-rewrite небезопасен). */
export function detectTs4(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    walk(program, (n) => {
        if (n.type !== "UnaryExpression" || n.operator !== "delete") return;
        if (n.argument.type !== "MemberExpression") return;
        findings.push(
            makeFinding("TS-4", "SHOULD", `delete obj[key] — рассмотри деструктуризацию вместо delete (TS-4)`, filePath, nodeStartRange(n)),
        );
    });

    return findings;
}
