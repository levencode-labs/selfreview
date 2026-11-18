import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";

const NESTED_COMPONENTS_SEGMENTS = 2; // хотя бы один уровень вложенности внутри фичи
const LARGE_FILE_LINES = 250;

/**
 * FS-4 (info — подсказка ревьюеру): новый вложенный .tsx заметного размера — рассмотри
 * перенос на уровень App/components.
 */
export function detectFs4(
    _program: import("@typescript-eslint/typescript-estree").TSESTree.Program | null,
    sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!state.isNew) return [];
    const segments = filePath.match(/\/components\//g)?.length ?? 0;
    if (segments < NESTED_COMPONENTS_SEGMENTS) return [];

    const lineCount = sourceText.split("\n").length;
    if (lineCount < LARGE_FILE_LINES) return [];

    return [
        makeFinding(
            "FS-4",
            "info",
            `Новый вложенный компонент — ${lineCount} строк. Если это отдельный пользовательский сценарий — рассмотри вынос на уровень App/components (FS-4)`,
            filePath,
            { start: { line: 1, column: 0 } },
        ),
    ];
}
