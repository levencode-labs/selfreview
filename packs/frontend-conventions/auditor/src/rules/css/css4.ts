import { detectCss4 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const css4 = contextRule({
    id: "CSS-4",
    severity: "MUST",
    title: "Все px-размеры кратны 4",
    appliesTo: (path) => /\.(scss|css)$/.test(path),
    usesAst: false,
    detector: detectCss4,
});
