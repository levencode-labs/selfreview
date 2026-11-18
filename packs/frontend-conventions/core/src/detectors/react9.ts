import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { walk, dirname } from "../ast/walk.js";
import { resolve } from "node:path";

/** Поиск импорта из селекторов дочернего компонента: components/<Child>/selectors/... */
const CHILD_SELECTORS_IMPORT_RE = /(?:^|\/)components\/([^/]+)\/selectors\//;
/** ViewModel-селекторы ребёнка: getXxxViewModel (для контейнера — явное нарушение) */
const VIEW_MODEL_RE = /viewModel/i;
/** Спецселекторы ребёнка, которые могут тянуться осознанно (saga/validation) — не флагаем как «простой селектор» */
const SPECIAL_SELECTOR_RE = /saga|validation/i;

interface ImportInfo {
    source: string;
    importedName: string;
}

/** Относительный импорт (./..) резолвится относительно папки файла и нормализуется. */
function effectiveSource(source: string, filePath: string): string {
    if (!source.startsWith(".")) return source;
    const resolved = resolve(dirname(filePath).replace(/\\/g, "/"), source).replace(/\\/g, "/");
    return resolved;
}

/**
 * REACT-9: контейнер НЕ тянет селекторы дочернего компонента.
 * Дочерняя View/ViewModel сама читает свой селектор через useSelector — контейнер не должен
 * вызывать getXxxViewModel ребёнка (MUST) — и вообще не должен useSelector'ить чужие селекторы
 * из components/<Child>/selectors/ (SHOULD для «простых»), помимо saga/validation-спецселекторов.
 * Сам файл при этом вне components/<Child>/.
 */
export function detectReact9(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    _state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!program || !/\.tsx$/.test(filePath)) return [];

    const normalizedPath = filePath.replace(/\\/g, "/");
    const imports = new Map<string, ImportInfo>();
    for (const stmt of program.body) {
        if (stmt.type !== "ImportDeclaration" || typeof stmt.source?.value !== "string") continue;
        const source = stmt.source.value;
        for (const spec of stmt.specifiers) {
            if (spec.type === "ImportSpecifier") {
                const importedName = spec.imported.type === "Identifier" ? spec.imported.name : spec.imported.value;
                imports.set(spec.local.name, { source, importedName });
            } else {
                imports.set(spec.local.name, { source, importedName: spec.local.name });
            }
        }
    }
    if (imports.size === 0) return [];

    const findings: Finding[] = [];
    walk(program, (n) => {
        if (n.type !== "CallExpression") return;
        if (n.callee.type !== "Identifier" || n.callee.name !== "useSelector") return;
        const arg = n.arguments[0];
        if (!arg || arg.type !== "Identifier") return;

        const info = imports.get(arg.name);
        if (!info) return;

        const childMatch = CHILD_SELECTORS_IMPORT_RE.exec(effectiveSource(info.source, normalizedPath));
        if (!childMatch) return;
        const child = childMatch[1];
        // файл сам принадлежит ребёнку — он и должен читать свои селекторы
        if (normalizedPath.includes(`/components/${child}/`)) return;

        const isViewModel = VIEW_MODEL_RE.test(info.importedName);
        // спецселекторы (saga/validation) ребёнка могут использоваться осознанно — пропускаем
        if (!isViewModel && SPECIAL_SELECTOR_RE.test(info.importedName)) return;

        findings.push(
            makeFinding(
                "REACT-9",
                isViewModel ? "MUST" : "SHOULD",
                isViewModel
                    ? `Контейнер вызывает чужой ViewModel дочернего компонента "${info.importedName}" (из components/${child}/selectors) вместо того, чтобы ребёнок сам получал свой ViewModel через useSelector, а контейнер — свой (REACT-9)`
                    : `Контейнер тянет простой селектор "${info.importedName}" из components/${child}/selectors дочернего компонента — ребёнок должен сам читать свои селекторы, контейнер — получать данные из своего ViewModel (REACT-9)`,
                filePath,
                { start: { line: n.loc.start.line, column: n.loc.start.column } },
            ),
        );
    });

    return findings;
}
