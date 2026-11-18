import { detectCss6 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const css6 = contextRule({
    id: "CSS-6",
    severity: "MUST",
    title: "font-size и line-height в CSS-модулях — используй @example/typography",
    appliesTo: (path) => /\.module\.(css|scss)$/.test(path),
    usesAst: false,
    detector: detectCss6,
});
