import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

/** FS-8 — экспорт через index именованными сущностями, без дефолтного экспорта. Report-only. */
export function detectFs8(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    for (const stmt of program.body) {
        if (stmt.type !== "ExportDefaultDeclaration") continue;
        findings.push(
            makeFinding(
                "FS-8",
                "MUST",
                `export default без явного обоснования — используй именованный экспорт (FS-8)`,
                filePath,
                nodeStartRange(stmt),
            ),
        );
    }

    return findings;
}
