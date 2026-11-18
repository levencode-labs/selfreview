import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { walk } from "../ast/walk.js";

/** Порог длины функции в строках (incl.): больше — повод вынести в helpers/. */
const MAX_LINES = 60;

/** Функция-рендер (компонент): тело — JSX, или блок с return JSX. Такие не флагаем как «в helpers». */
function isRenderFunction(n: TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration | TSESTree.FunctionExpression): boolean {
    const body = n.body;
    if (body.type === "JSXElement" || body.type === "JSXFragment") return true;
    if (body.type === "BlockStatement") {
        for (const stmt of body.body) {
            if (stmt.type === "ReturnStatement" && stmt.argument && (stmt.argument.type === "JSXElement" || stmt.argument.type === "JSXFragment")) return true;
        }
    }
    return false;
}

const FN_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

/**
 * MISC-17: длинная функция внутри компонента (.tsx) — вынеси логику в helpers/.
 * Component-рендеры (возвращают JSX) исключены — там свои критерии (разбивка, FS-4).
 * Severity — SHOULD, эвристика: «выглядит как логика, достойная отдельного хелпера».
 */
export function detectMisc17(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    _state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!program || !/\.tsx$/.test(filePath)) return [];

    const findings: Finding[] = [];
    walk(program, (n) => {
        const node = n as TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration | TSESTree.FunctionExpression;
        if (!FN_TYPES.has(n.type)) return;
        if (!node.loc || !node.body || node.body.type !== "BlockStatement") return;
        if (isRenderFunction(node)) return;
        const lines = node.loc.end.line - node.loc.start.line + 1;
        if (lines <= MAX_LINES) return;

        const name =
            n.type === "FunctionDeclaration" && n.id?.type === "Identifier"
                ? n.id.name
                : n.type === "FunctionExpression" && n.id?.type === "Identifier"
                  ? n.id.name
                  : null;

        findings.push(
            makeFinding(
                "MISC-17",
                "SHOULD",
                name
                    ? `Функция "${name}" длиной ${lines} строк внутри компонента — вынеси логику в helpers/ (упростит переиспользование и тестирование) (MISC-17)`
                    : `Анонимная функция длиной ${lines} строк внутри компонента — вынеси логику в helpers/ (MISC-17)`,
                filePath,
                { start: { line: node.loc.start.line, column: node.loc.start.column } },
            ),
        );
    });

    return findings;
}
