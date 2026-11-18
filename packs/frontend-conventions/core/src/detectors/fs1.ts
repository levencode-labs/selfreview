import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { walk, basename, stripExt, isPascalCase, componentBody } from "../ast/walk.js";

function containsJsx(node: TSESTree.Node): boolean {
    let found = false;
    walk(node, (n) => {
        if (n.type === "JSXElement" || n.type === "JSXFragment") found = true;
    });
    return found;
}

/** Имена верхнеуровневых сущностей, похожих на React-компонент (PascalCase + JSX в теле). */
function findComponentDeclarations(program: TSESTree.Program): { name: string; line: number }[] {
    const result: { name: string; line: number }[] = [];

    for (const stmt of program.body) {
        if (stmt.type === "FunctionDeclaration" && stmt.id && isPascalCase(stmt.id.name)) {
            if (containsJsx(stmt.body)) result.push({ name: stmt.id.name, line: stmt.loc.start.line });
        }
        if (stmt.type === "ExportNamedDeclaration" && stmt.declaration?.type === "FunctionDeclaration") {
            const fn = stmt.declaration;
            if (fn.id && isPascalCase(fn.id.name) && containsJsx(fn.body)) {
                result.push({ name: fn.id.name, line: fn.loc.start.line });
            }
        }
        const declarations =
            stmt.type === "VariableDeclaration"
                ? stmt.declarations
                : stmt.type === "ExportNamedDeclaration" && stmt.declaration?.type === "VariableDeclaration"
                  ? stmt.declaration.declarations
                  : [];
        for (const decl of declarations) {
            if (
                decl.id.type === "Identifier" &&
                isPascalCase(decl.id.name) &&
                decl.init
            ) {
                const body = componentBody(decl.init);
                if (body && containsJsx(body)) result.push({ name: decl.id.name, line: decl.loc.start.line });
            }
        }
    }
    return result;
}

/**
 * FS-1: один компонент = одна папка. Для нового файла — весь файл; для изменённого
 * аудитор фильтрует по добавленным строкам (addedLines); в ESLint без diff-информации
 * работает по всему файлу (режим «максимум»).
 */
export function detectFs1(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!program) return [];

    const components = findComponentDeclarations(program);
    if (components.length <= 1) return [];

    const isWholeFileNew = !!state.isNew;
    const fileBaseName = stripExt(basename(filePath));
    const findings: Finding[] = [];
    for (const c of components) {
        if (c.name === fileBaseName) continue;
        // на существующем файле auditor репортит только если вставка — часть текущего диффа
        if (!isWholeFileNew && state.addedLines && !state.addedLines.has(c.line)) continue;
        findings.push(
            makeFinding(
                "FS-1",
                "MUST",
                `Компонент "${c.name}" объявлен внутри файла "${fileBaseName}.tsx" — один компонент должен жить в отдельной папке (FS-1)`,
                filePath,
                { start: { line: c.line, column: 0 } },
            ),
        );
    }
    return findings;
}
