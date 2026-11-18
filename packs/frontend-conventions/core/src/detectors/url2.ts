import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

const DRILLED_PROP_NAMES = new Set(["routeMatch", "match"]);

/** URL-2 — параметры маршрута не прокидывать пропом через полстраницы; чтение через useParams. */
export function detectUrl2(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    walk(program, (n) => {
        if (n.type !== "JSXAttribute" || n.name.type !== "JSXIdentifier") return;
        if (!DRILLED_PROP_NAMES.has(n.name.name)) return;
        const value = n.value;
        if (value?.type === "JSXExpressionContainer" && value.expression.type === "Identifier" && value.expression.name === n.name.name) {
            findings.push(
                makeFinding(
                    "URL-2",
                    "MUST",
                    `Проп "${n.name.name}" прокидывается дочернему компоненту напрямую — читай параметры маршрута через useParams в месте использования (URL-2)`,
                    filePath,
                    nodeStartRange(n),
                ),
            );
        }
    });

    return findings;
}
