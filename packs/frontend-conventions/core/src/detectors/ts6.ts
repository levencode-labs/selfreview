import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

function isStringLiteral(node: unknown): boolean {
    const n = node as { type?: string; value?: unknown } | undefined;
    return !!n && n.type === "Literal" && typeof n.value === "string";
}

/**
 * TS-6 — enum должен быть строковым. Числовые/неявные enum'ы — нарушение.
 * Автофикса нет: значения нужно придумывать вручную (нельзя сгенерировать строковые значения однозначно).
 */
export function detectTs6(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    walk(program, (n) => {
        if (n.type !== "TSEnumDeclaration") return;
        const hasNonStringMember = n.members.some((member) => !isStringLiteral(member.initializer));
        if (!hasNonStringMember) return;
        findings.push(
            makeFinding(
                "TS-6",
                "SHOULD",
                `Enum "${n.id.name}" — не строковый (числовой или без явных значений). Пишем строковые енамы: проще дебажить (TS-6)`,
                filePath,
                nodeStartRange(n),
            ),
        );
    });

    return findings;
}
