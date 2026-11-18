import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

function superClassName(node: { superClass?: unknown }): string | null {
    const sc = node.superClass as
        | { type?: string; name?: string; property?: { name?: string } }
        | undefined;
    if (!sc) return null;
    if (sc.type === "Identifier") return sc.name ?? null;
    if (sc.type === "MemberExpression") return (sc.property as { name?: string } | undefined)?.name ?? null;
    return null;
}

const CLASS_COMPONENT_BASES = new Set(["Component", "PureComponent"]);

/** REACT-8 — в class-компонентах без constructor, если можно обойтись. Report-only. */
export function detectReact8(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    walk(program, (n) => {
        if (n.type !== "ClassDeclaration") return;
        const base = superClassName(n);
        if (!base || !CLASS_COMPONENT_BASES.has(base)) return;

        for (const el of n.body.body) {
            if (el.type !== "MethodDefinition" || el.kind !== "constructor") continue;
            findings.push(
                makeFinding(
                    "REACT-8",
                    "SHOULD",
                    `constructor в class-компоненте "${n.id?.name ?? "(anonymous)"}" — рассмотри поля класса/componentDidMount вместо него (REACT-8)`,
                    filePath,
                    nodeStartRange(el),
                ),
            );
        }
    });

    return findings;
}
