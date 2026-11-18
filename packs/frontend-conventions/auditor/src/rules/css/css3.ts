import { detectCss3 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const css3 = contextRule({
    id: "CSS-3",
    severity: "MUST",
    title: "Глобальные классы — с префиксом global_",
    appliesTo: (path) => /\.(scss|css)$/.test(path),
    usesAst: false,
    detector: detectCss3,
});
