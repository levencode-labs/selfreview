import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { walk } from "../ast/walk.js";
import { moduleConstants, literalTree, constantsFile } from "./staticConfiguration.js";
import { usageRange } from "./renderAnalysis.js";

const CONSTANT_NAME_RE = /^[A-Z][A-Z0-9_]*$/;

/**
 * Автоматическая часть FS-7: экспортируемая SCREAMING_SNAKE-константа объявлена вне
 * `constants.ts` (а не в helpers/слайсе/компоненте). Уровень («вложенный компонент / компонент /
 * shared / legacy-ui») per-file не определить — остаётся в ручном чек-листе; сам факт «константа
 * в неправильном файле» детектируется однозначно.
 */
export function detectFs7(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!program || constantsFile(filePath) || state.isDeleted) return [];

    const findings: Finding[] = [];
    walk(program, (n) => {
        if (n.type !== "ExportNamedDeclaration" || n.declaration?.type !== "VariableDeclaration") return;
        if (n.declaration.kind !== "const") return;

        for (const declarator of n.declaration.declarations) {
            if (declarator.id.type !== "Identifier" || !CONSTANT_NAME_RE.test(declarator.id.name)) continue;
            findings.push(
                makeFinding(
                    "FS-7",
                    "MUST",
                    `Константа "${declarator.id.name}" объявлена вне constants — константы складываем в constants соответствующего уровня (FS-7)`,
                    filePath,
                    { start: { line: declarator.loc.start.line, column: 0 } },
                ),
            );
        }
    });

    // Existing exported MUST remains unchanged; new unexported configuration is advisory.
    if (/\.tsx$|(?:^|[\\/])sagas\.ts$/.test(filePath)) for (const d of moduleConstants(program)) {
        if (d.id.type !== "Identifier" || !CONSTANT_NAME_RE.test(d.id.name) || !literalTree(d.init)) continue;
        if (program.body.some(s => s.type === "ExportNamedDeclaration" && s.declaration?.type === "VariableDeclaration" && s.declaration.declarations.some(declaration => declaration === d))) continue;
        if (state.addedLines && ![...state.addedLines].some(l => l >= d.loc.start.line && l <= d.loc.end.line)) continue;
        findings.push(makeFinding("FS-7", "SHOULD",
            `Статическая конфигурация "${d.id.name}" — рассмотрите constants на уровне её потребителей (FS-7)`,
            filePath, usageRange(d, state)));
    }
    return findings;
}
