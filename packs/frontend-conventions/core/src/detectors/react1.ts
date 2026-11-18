import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";
import { renderAnalysis, staticMemberName } from "./renderAnalysis.js";

const CLASS_COMPONENT_BASES = new Set(["Component", "PureComponent"]);

/** REACT-1 — только функциональные компоненты: class extends Component/PureComponent — нарушение. */
export function detectReact1(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];
    const analysis = renderAnalysis(program);

    walk(program, (n) => {
        if ((n.type !== "ClassDeclaration" && n.type !== "ClassExpression") || !n.superClass) return;
        const imported = analysis.imported(n.superClass);
        const fallback = n.superClass.type === "Identifier"
            ? analysis.globalReference(n.superClass)
            : n.superClass.type === "MemberExpression" && analysis.globalReference(n.superClass.object) === "React"
                ? staticMemberName(n.superClass.property, n.superClass.computed)
                : undefined;
        const base = imported?.source === "react" ? imported.name : fallback;
        if (!base || !CLASS_COMPONENT_BASES.has(base)) return;
        findings.push(
            makeFinding(
                "REACT-1",
                "MUST",
                `Класс-компонент "${n.id?.name ?? "(anonymous)"}" extends ${base} — используем только функциональные компоненты (REACT-1)`,
                filePath,
                nodeStartRange(n),
            ),
        );
    });

    return findings;
}
