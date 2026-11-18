import { inProfileDirectory, profile } from "../profile.js";
import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

const DATE_LIB = /^(moment|dayjs|date-fns|luxon)(?:\/|$)/;

/** MISC-1 — импорт библиотек дат только из реализации Utc/Local. */
export function detectMisc1(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program || inProfileDirectory(filePath, profile.dateImplementation)) return [];
    const findings: Finding[] = [];

    walk(program, (n) => {
        if (n.type === "ImportDeclaration" && DATE_LIB.test(String(n.source.value))) {
            findings.push(makeFinding("MISC-1", "MUST", `Импорт библиотеки дат напрямую — используй Utc/Local из ${profile.appUi}/libs/date (MISC-1)`, filePath, nodeStartRange(n)));
        }
        if (n.type !== "CallExpression") return;
        const callee = n.callee;
        if (callee.type === "Identifier" && callee.name === "moment") {
            findings.push(makeFinding("MISC-1", "MUST", `Прямой вызов moment() — используй только хелперы (MISC-1)`, filePath, nodeStartRange(n)));
        }
        if (callee.type === "MemberExpression" && callee.object.type === "Identifier" && callee.object.name === "moment" && callee.property.type === "Identifier" && callee.property.name === "utc") {
            findings.push(makeFinding("MISC-1", "MUST", `Прямой вызов moment.utc() — используй только хелперы (MISC-1)`, filePath, nodeStartRange(n)));
        }
    });

    return findings;
}
