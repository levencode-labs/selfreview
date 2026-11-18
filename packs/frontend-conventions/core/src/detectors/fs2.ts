import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";

const MAX_COMPONENTS_SEGMENTS = 3; // App/components/<Feature>/components/<Child>/ — 2 сегмента, это ok

/**
 * FS-2: вложенность компонентов ≤ 2 уровней (глубже — желательно выносить).
 * SHOULD и только для нового/переименованного файла.
 */
export function detectFs2(
    _program: import("@typescript-eslint/typescript-estree").TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!state.isNew) return [];
    const segments = filePath.match(/\/components\//g)?.length ?? 0;
    if (segments <= MAX_COMPONENTS_SEGMENTS) return [];

    return [
        makeFinding(
            "FS-2",
            "SHOULD",
            `Файл лежит глубже 2 уровней вложенности components/ — желательно не больше (FS-2)`,
            filePath,
            { start: { line: 1, column: 0 } },
        ),
    ];
}
