import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { basename } from "../ast/walk.js";

/**
 * MISC-4: безымянный helpers.ts — назови хелпер по сущности (<имя_сущности>Helpers.ts).
 * Только для нового файла.
 */
export function detectMisc4(
    _program: import("@typescript-eslint/typescript-estree").TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!state.isNew) return [];
    if (basename(filePath) !== "helpers.ts") return [];

    return [
        makeFinding(
            "MISC-4",
            "MUST",
            `Безымянный "helpers.ts" — назови хелпер по сущности, для которой он написан: <имя_сущности>Helpers.ts (MISC-4)`,
            filePath,
            { start: { line: 1, column: 0 } },
        ),
    ];
}
