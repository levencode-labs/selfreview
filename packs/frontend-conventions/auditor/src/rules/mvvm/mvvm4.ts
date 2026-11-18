import { detectMvvm4 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const mvvm4 = astRule({
    id: "MVVM-4",
    severity: "SHOULD",
    title: "View-селектор для списка — через фабрику createSelector",
    appliesTo: (path) => /\.ts$/.test(path) && /selectors/i.test(path),
    detector: detectMvvm4,
});
