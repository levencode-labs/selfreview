import { profile } from "../profile.js";
import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { basename, stripExt } from "../ast/walk.js";

/**
 * Известные аналоги в react-ui — конфиг-список (заведомо неполный, расширяй по мере находок).
 */
const KNOWN_REACT_UI_EQUIVALENTS = new Set(["CurrencyInput", "Checkbox", "Select", "Paging", "Table", "Input", "Button", "DatePicker", "Tooltip", "Modal", "Toast", "RadioGroup", "Switcher"]);

/**
 * RUI-2: кастомный компонент (в components/) с именем как в react-ui — посмотри аналог.
 * Только для нового/переименованного файла.
 */
export function detectRui2(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!state.isNew) return [];

    const name = stripExt(basename(filePath));
    if (!KNOWN_REACT_UI_EQUIVALENTS.has(name)) return [];
    if (!program) return [];

    // если это просто ре-экспорт react-ui ("export { Checkbox } from '@example/react-ui'") — не наш кейс
    const isReexportFromReactUi = program.body.some(
        (stmt) => stmt.type === "ExportNamedDeclaration" && typeof stmt.source?.value === "string" && (stmt.source.value === profile.reactUi || stmt.source.value.startsWith(profile.reactUi + "/")),
    );
    if (isReexportFromReactUi) return [];

    return [
        makeFinding(
            "RUI-2",
            "SHOULD",
            `Компонент "${name}" — в react-ui уже есть компонент с таким назначением, посмотри, можно ли им заменить кастомный (RUI-2)`,
            filePath,
            { start: { line: 1, column: 0 } },
        ),
    ];
}
