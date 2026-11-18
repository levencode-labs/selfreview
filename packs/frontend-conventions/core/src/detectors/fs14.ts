import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";

/**
 * FS-14: тестовые файлы лежат в __tests__/. Только для нового файла (legacy-тесты разбросаны,
 * по ним не шумим).
 */
export function detectFs14(
    _program: import("@typescript-eslint/typescript-estree").TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!state.isNew) return [];
    if (filePath.includes("/__tests__/")) return [];

    return [
        makeFinding(
            "FS-14",
            "MUST",
            `Тестовый файл не в __tests__/ — перенеси (FS-14)`,
            filePath,
            { start: { line: 1, column: 0 } },
        ),
    ];
}
