import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { basename, dirname, stripExt } from "../ast/walk.js";

/**
 * FS-13: файлы в папке slices/ называются <сущность>Slice.
 * Только для нового/переименованного файла.
 */
export function detectFs13(
    _program: import("@typescript-eslint/typescript-estree").TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!state.isNew) return [];
    if (basename(dirname(filePath)) !== "slices") return [];

    const name = stripExt(basename(filePath));
    if (/\.(test|spec)$/.test(name)) return [];
    if (name === "index") return [];
    if (/Slice$/.test(name)) return [];

    return [
        makeFinding(
            "FS-13",
            "MUST",
            `Файл "${basename(filePath)}" в папке slices/ — должен называться <сущность>Slice (FS-13)`,
            filePath,
            { start: { line: 1, column: 0 } },
        ),
    ];
}
