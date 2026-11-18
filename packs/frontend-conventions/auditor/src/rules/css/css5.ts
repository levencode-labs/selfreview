import { detectCss5 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const css5 = contextRule({
    id: "CSS-5",
    severity: "MUST",
    title: "Цвета — из палитры (без хардкода HEX/rgb/hsl)",
    appliesTo: (path) => /\.(scss|css)$/.test(path),
    usesAst: false,
    detector: detectCss5,
});
