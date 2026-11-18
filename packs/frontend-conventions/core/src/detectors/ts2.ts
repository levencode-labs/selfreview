import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding, Severity, SourceRange, SuggestionSpec, FixSpec } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";
import { renderAnalysis, unwrap } from "./renderAnalysis.js";

function booleanType(type: TSESTree.TypeNode): boolean {
    return type.type === "TSBooleanKeyword"
        || (type.type === "TSLiteralType" && isBoolLiteral(type.literal))
        || (type.type === "TSUnionType" && type.types.every(booleanType));
}

function isBoolLiteral(node: TSESTree.Node | null | undefined): boolean {
    return !!node && node.type === "Literal" && typeof (node as { value?: unknown }).value === "boolean";
}

/**
 * TS-2 — избыточные === true / === false / !== true / !== false.
 * Без type information нельзя уверенно утвердить эквивалентность `x === true` → `x`,
 * поэтому автофикса нет; есть suggestion, применяемая только к узлам, где литерал справа.
 */
export function detectTs2(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];
    const analysis = renderAnalysis(program);

    walk(program, (n) => {
        if (n.type !== "BinaryExpression") return;
        if (n.operator !== "===" && n.operator !== "!==") return;
        const boolLeft = isBoolLiteral(n.left);
        const boolRight = isBoolLiteral(n.right);
        const isBooleanComparison = boolLeft || boolRight;
        if (!isBooleanComparison) return;
        const operand = unwrap(boolRight ? n.left : n.right);
        if (operand.type === "Identifier") {
            const binding = analysis.localBinding(operand.name, operand);
            const target = binding?.type === "VariableDeclarator" ? binding.id
                : binding?.type === "AssignmentPattern" ? binding.left : binding;
            if (target?.type === "Identifier" && (target.optional
                || (target.typeAnnotation && !booleanType(target.typeAnnotation.typeAnnotation)))) return;
        } else if (operand.type === "Literal" && !isBoolLiteral(operand)) {
            return;
        }

        const loc = nodeStartRange(n);
        const message = `Избыточное сравнение "${n.operator}" с булевым литералом (TS-2)`;

        const suggestions: SuggestionSpec[] = [];
        // Предлагаем упрощение только когда булев литерал стоит справа и левая часть — не литерал:
        // `x === true` -> `x` (эквивалентно только для boolean; scenario mock типов мы не знаем).
        // `x !== true` -> `!x` только при доказанном boolean — оставляем это требование в message.
        if (boolRight && !boolLeft && n.right.type === "Literal" && n.left.type !== "Literal") {
            const negate = (n.operator === "===") !== n.right.value;
            const operandText = sourceText.slice(n.left.range[0], n.left.range[1]);
            const text = n.left.type === "Identifier" || n.left.type === "MemberExpression" ? operandText : "(" + operandText + ")";
            suggestions.push({
                desc: "Убрать сравнение с булевым литералом (только если левая часть гарантированно boolean)",
                fix: { range: [n.range[0], n.range[1]], text: (negate ? "!" : "") + text },
            });
        }

        findings.push(makeFinding("TS-2", "SHOULD", message, filePath, loc, undefined, suggestions.length ? suggestions : undefined));
    });

    return findings;
}

export type { Severity, SourceRange, FixSpec };
