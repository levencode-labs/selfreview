import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";
import { renderAnalysis } from "./renderAnalysis.js";

function usesGeneratedUrl(call: TSESTree.CallExpression): boolean {
    let found = false;
    walk(call, (n) => {
        if (
            n.type === "CallExpression" &&
            n.callee.type === "MemberExpression" &&
            n.callee.object.type === "Identifier" &&
            /Urls$/.test(n.callee.object.name) &&
            n.callee.property.type === "Identifier" &&
            /^get.*Url$/.test(n.callee.property.name)
        ) {
            found = true;
        }
    });
    return found;
}

/** URL-1 — ajax через сгенерированные методы App/server; Url.Action / сырой fetch / axios — замечание. */
export function detectUrl1(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];
    const analysis = renderAnalysis(program);

    walk(program, (n) => {
        if (n.type === "CallExpression" && n.callee.type === "MemberExpression") {
            const obj = n.callee.object;
            const prop = n.callee.property;
            if (obj.type === "Identifier" && obj.name === "Url" && prop.type === "Identifier" && prop.name === "Action") {
                findings.push(
                    makeFinding(
                        "URL-1",
                        "MUST",
                        `Url.Action(...) — устаревший способ генерации урла через модель с бэка, используй сгенерированные методы из App/server (URL-1)`,
                        filePath,
                        nodeStartRange(n),
                    ),
                );
                return;
            }
            if (obj.type === "Identifier" && obj.name === "axios" && !usesGeneratedUrl(n)) {
                findings.push(
                    makeFinding(
                        "URL-1",
                        "SHOULD",
                        `Прямой вызов axios вне App/server — похоже на ручной ajax вместо сгенерированного клиента (URL-1)`,
                        filePath,
                        nodeStartRange(n),
                    ),
                );
            }
        }
        if (n.type === "CallExpression" && analysis.globalReference(n.callee) === "fetch") {
            findings.push(
                makeFinding(
                    "URL-1",
                    "SHOULD",
                    `Прямой вызов fetch(...) вне App/server — похоже на ручной ajax вместо сгенерированного клиента (URL-1)`,
                    filePath,
                    nodeStartRange(n),
                ),
            );
        }
    });

    return findings;
}
