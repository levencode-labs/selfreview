import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { dirname } from "../ast/walk.js";

/**
 * MVVM-2: рядом с новым viewSelectors.ts обязан лежать baseSelectors.ts (селекторы
 * разложены по категориям). Только для нового файла — в ESLint через git-статус.
 */
export function detectMvvm2(
    _program: import("@typescript-eslint/typescript-estree").TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!state.isNew) return [];
    const selectorsDir = dirname(filePath);
    const sibling = selectorsDir + "/baseSelectors.ts";
    if (state.hasFile) {
        if (state.hasFile(sibling)) return [];
    } else {
        if (!state.repoRoot || existsSync(join(state.repoRoot, selectorsDir, "baseSelectors.ts"))) return [];
    }

    return [
        makeFinding(
            "MVVM-2",
            "MUST",
            `Рядом с viewSelectors.ts нет baseSelectors.ts — селекторы должны быть разложены по категориям (baseSelectors/viewSelectors/...) (MVVM-2)`,
            filePath,
            { start: { line: 1, column: 0 } },
        ),
    ];
}
