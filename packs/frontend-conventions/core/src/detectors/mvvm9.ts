import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";

// два вложенных сегмента "components" перед selectors — папка селекторов внутри дочернего
// компонента, а не в корне фичи (App/components/<Фича>/selectors/ — валидная, тут не матчится)
const NESTED_SELECTORS_RE = /\/components\/[^/]+\/components\/[^/]+\/selectors\//;

/**
 * MVVM-9: view-селекторы живут в корневой <Фича>/selectors/, а не в components/<Компонент>/selectors/.
 * MUST для нового файла, SHOULD — для существующего (перенос напрашивается, но не блокирует).
 */
export function detectMvvm9(
    _program: import("@typescript-eslint/typescript-estree").TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (state.isDeleted) return [];
    if (!NESTED_SELECTORS_RE.test(filePath)) return [];

    const isNew = !!state.isNew;
    const severity = isNew ? "MUST" : "SHOULD";
    const suffix = isNew
        ? ""
        : " Файл существовал до ветки, но раз он и так меняется — перенос напрашивается вместе с правкой.";

    return [
        makeFinding(
            "MVVM-9",
            severity,
            `Селекторы не должны лежать в components/<Компонент>/selectors/ — все view-селекторы фичи собираются в корневой <Фича>/selectors/ (MVVM-9).${suffix}`,
            filePath,
            { start: { line: 1, column: 0 } },
        ),
    ];
}
