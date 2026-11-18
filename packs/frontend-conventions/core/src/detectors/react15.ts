import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { walk } from "../ast/walk.js";

function isFcTypeName(typeName: TSESTree.TSTypeReference["typeName"]): boolean {
    if (typeName.type === "Identifier") return typeName.name === "FC";
    // React.FC — это TSQualifiedName (left = React, right = FC)
    if (typeName.type === "TSQualifiedName") {
        return typeName.left.type === "Identifier" && typeName.left.name === "React" && typeName.right.type === "Identifier" && typeName.right.name === "FC";
    }
    return false;
}

/**
 * REACT-15: не аннотируем функциональный компонент через : FC / : React.FC — это лишняя сложность
 * (функция уже функциональный компонент; тип пропсов выводится из параметров). Аннотация FC
 * навязывает children/ref и прячет ошибки типов пропсов.
 * Детект: TSTypeReference на FC/React.FC + `import { FC } from "react"`.
 * Severity — MUST.
 */
export function detectReact15(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    _state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!program || !/\.tsx$/.test(filePath)) return [];

    const findings: Finding[] = [];
    const report = (loc: { line: number; column: number }, extra: string): void => {
        findings.push(
            makeFinding(
                "REACT-15",
                "MUST",
                `Аннотация "FC"${extra} — не нужна: компонент уже функциональный, тип пропсов выводится (REACT-15)`,
                filePath,
                { start: { line: loc.line, column: loc.column } },
            ),
        );
    };

    walk(program, (n) => {
        if (n.type === "TSTypeReference") {
            if (!isFcTypeName(n.typeName)) return;
            if (!n.loc) return;
            report(n.loc.start, "");
            return;
        }
        if (n.type === "ImportDeclaration") {
            const source = typeof n.source?.value === "string" ? n.source.value : "";
            if (source !== "react") return;
            for (const spec of n.specifiers) {
                if (spec.type !== "ImportSpecifier") continue;
                if (spec.imported.type !== "Identifier" || spec.imported.name !== "FC") continue;
                if (!n.loc) return;
                report(n.loc.start, " (импорт лишний)");
                return;
            }
            return;
        }
    });

    return findings;
}
