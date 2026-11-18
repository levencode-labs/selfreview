import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

const FORBIDDEN_BARE_DEPS = new Set(["routeMatch", "location"]);

/** REACT-4 — useEffect deps — не routeMatch/location целиком (новый объект на каждый рендер). */
export function detectReact4(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    walk(program, (n) => {
        if (n.type !== "CallExpression") return;
        if (n.callee.type !== "Identifier" || n.callee.name !== "useEffect") return;
        const depsArg = n.arguments[1];
        if (!depsArg || depsArg.type !== "ArrayExpression") return;
        for (const el of depsArg.elements) {
            if (!el || el.type !== "Identifier" || !FORBIDDEN_BARE_DEPS.has(el.name)) continue;
            findings.push(
                makeFinding(
                    "REACT-4",
                    "MUST",
                    `useEffect deps содержит "${el.name}" целиком — новый объект на каждый рендер, укажи конкретные поля (${el.name}.params.x, ${el.name}.url) (REACT-4)`,
                    filePath,
                    nodeStartRange(el),
                ),
            );
        }
    });

    return findings;
}
