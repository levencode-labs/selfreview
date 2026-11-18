import { detectMvvm2 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const mvvm2 = contextRule({
    id: "MVVM-2",
    severity: "MUST",
    title: "Селекторы разбиты на категории (baseSelectors, viewSelectors...)",
    appliesTo: (path) => /viewSelectors\.ts$/.test(path) && path.includes("/selectors/"),
    fileLevel: true,
    usesAst: false,
    detector: detectMvvm2,
});
