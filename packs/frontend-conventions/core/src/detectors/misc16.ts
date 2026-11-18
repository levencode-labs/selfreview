import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { walk } from "../ast/walk.js";
import { moduleConstants, literalTree, constantsFile } from "./staticConfiguration.js";
import { usageRange } from "./renderAnalysis.js";

const SCREAMING_RE = /^[A-Z][A-Z0-9_]*$/;

/**
 * MISC-16: константы-литералы в .tsx-файлах компонентов — выноси в constants.
 * `const listPageLimit = 20;` / `const placeholder = "Введите номер";` — это константы,
 * которым место в constants.ts фичи, а не в теле компонента (FS-7 ловит только SCREAMING_SNAKE
 * в принципе; здесь — любой литерал, объявленный не через SCREAMING_SNAKE).
 * Исключения: null/boolean, шаблонные строки, SCREAMING_SNAKE-имена (там своё правило FS-7),
 * Object/array literal trees module-level теперь поддерживаются как advisory.
 * JSX, handlers и runtime-derived значения не входят в static configuration.
 * Severity — SHOULD (эвристика, минор).
 */
export function detectMisc16(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!program || !/\.tsx$/.test(filePath) || constantsFile(filePath) || state.isDeleted) return [];

    const findings: Finding[] = [];
    walk(program, (n, parent) => {
        if (n.type !== "VariableDeclarator" || parent?.type !== "VariableDeclaration" || parent.kind !== "const") return;
        if (n.id.type !== "Identifier") return;
        const name = n.id.name;
        if (name.length < 3) return;
        if (SCREAMING_RE.test(name)) return; // SCREAMING_SNAKE — отдельное правило FS-7
        const init = n.init;
        if (!init || init.type !== "Literal") return;
        const value = init.value;
        if (typeof value !== "number" && typeof value !== "string") return;
        if (typeof value === "string" && value.trim() === "") return;
        if (typeof value === "number" && value >= -1 && value <= 1) return; // мелкие числа — не константы
        if (!n.loc || !n.id.loc) return;

        findings.push(
            makeFinding(
                "MISC-16",
                "SHOULD",
                `Константа "${name}" = ${JSON.stringify(value)} объявлена в компоненте — вынеси в constants.ts (поименованный литерал в .tsx, не SCREAMING_SNAKE) (MISC-16)`,
                filePath,
                { start: { line: n.id.loc.start.line, column: n.id.loc.start.column } },
            ),
        );
    });

    for (const d of moduleConstants(program)) {
        if (d.id.type !== "Identifier" || SCREAMING_RE.test(d.id.name) || !literalTree(d.init)) continue;
        if (findings.some(f => f.line === d.id.loc.start.line && f.column === d.id.loc.start.column + 1)) continue;
        findings.push(makeFinding("MISC-16", "SHOULD",
            'Статическая конфигурация "' + d.id.name + '" — рассмотрите constants на уровне её потребителей; уровень выбирается вручную (MISC-16)',
            filePath, usageRange(d, state)));
    }
    return findings;
}
