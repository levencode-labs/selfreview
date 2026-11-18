import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { walk } from "../ast/walk.js";

const EVENT_PROP_RE = /^on[A-Z]/;

/**
 * REACT-12: действие в JSX-хендлер передаём только через именованный обработчик handle*,
 * а не через прямую ссылку на bindedActions: `onClick={bindedActions.clearItemFilter}`.
 * После обновления redux обработчик напрямую в onClick передать будет нельзя — всегда обёртка:
 *   const handleResetFilter = () => bindedActions.clearItemFilter();
 *   <button onClick={handleResetFilter} />
 * Анонимные инлайн-стрелки (`onClick={() => bindedActions.x()}`) — это уже REACT-7, не дублируем.
 * Детект: JSX-атрибут on* со значением `<bound>.<action>` напрямую (без именованного обработчика).
 * Для НОВЫХ файлов — MUST, для существующих — SHOULD.
 */
export function detectReact12(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!program || !/\.tsx$/.test(filePath)) return [];

    const boundSet = new Set<string>();
    walk(program, (n) => {
        if (n.type !== "VariableDeclarator") return;
        if (n.id.type !== "Identifier") return;
        if (!n.init || n.init.type !== "CallExpression" || n.init.callee.type !== "Identifier" || n.init.callee.name !== "useActions") return;
        boundSet.add(n.id.name);
    });
    if (boundSet.size === 0) return [];

    const findings: Finding[] = [];
    const severity: "MUST" | "SHOULD" = state.isNew ? "MUST" : "SHOULD";

    walk(program, (n) => {
        if (n.type !== "JSXAttribute" || n.name.type !== "JSXIdentifier") return;
        if (!EVENT_PROP_RE.test(n.name.name)) return;
        const value = n.value;
        if (!value || value.type !== "JSXExpressionContainer") return;
        const expr = value.expression;
        // Инлайн-стрелка — это REACT-7; здесь ловим только прямую передачу bound-действия.
        if (expr.type === "ArrowFunctionExpression" || expr.type === "FunctionExpression") return;
        if (expr.type !== "MemberExpression") return;
        if (expr.object.type !== "Identifier" || !boundSet.has(expr.object.name)) return;
        if (expr.property.type !== "Identifier") return;
        if (!n.loc) return;

        findings.push(
            makeFinding(
                "REACT-12",
                severity,
                severity === "MUST"
                    ? `Действие ${expr.object.name}.${expr.property.name} передаётся в "${n.name.name}" напрямую — заведи именованный обработчик (const handleX = () => ${expr.object.name}.${expr.property.name}();) и передавай его (REACT-12)`
                    : `Действие ${expr.object.name}.${expr.property.name} в "${n.name.name}" напрямую — вынеси в именованный обработчик handle* (после обновления redux так делать будет нельзя) (REACT-12)`,
                filePath,
                { start: { line: n.loc.start.line, column: n.loc.start.column } },
            ),
        );
    });

    return findings;
}
