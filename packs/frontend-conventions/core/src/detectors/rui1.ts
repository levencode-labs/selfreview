import { profile } from "../profile.js";
import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

/** RUI-1 — не импортировать иконки из "@example/icons" целиком. */
export function detectRui1(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    for (const stmt of program.body) {
        if (stmt.type !== "ImportDeclaration") continue;
        const from = String(stmt.source.value);
        const root = from === profile.icons;
        if (!root && !from.startsWith(profile.icons + "/icons/")) continue;
        if (root && (stmt.importKind === "type" || (stmt.specifiers.length > 0
            && stmt.specifiers.every(spec => spec.type === "ImportSpecifier" && spec.importKind === "type")))) continue;
        findings.push(
            makeFinding(
                "RUI-1",
                "MUST",
                `Импорт из корня или устаревшего пути библиотеки иконок — используй ${profile.icons}/Имя16Solid (RUI-1)`,
                filePath,
                nodeStartRange(stmt),
            ),
        );
    }

    return findings;
}
