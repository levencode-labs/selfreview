import { detectMvvm9 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

const NESTED_SELECTORS_RE = /\/components\/[^/]+\/components\/[^/]+\/selectors\//;

export const mvvm9 = contextRule({
    id: "MVVM-9",
    severity: "MUST",
    title: "Все view-селекторы — в корневой папке selectors фичи",
    appliesTo: (path) => /\.ts$/.test(path) && NESTED_SELECTORS_RE.test(path),
    fileLevel: true,
    usesAst: false,
    detector: detectMvvm9,
});
