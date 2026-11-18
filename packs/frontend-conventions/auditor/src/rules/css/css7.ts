import { detectCss7 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const css7 = contextRule({
    id: "CSS-7",
    severity: "MUST",
    title: "data-tid в css-селекторе не используем — стилизуем по классу",
    appliesTo: (path) => /\.module\.(css|scss)$/.test(path),
    usesAst: false,
    detector: detectCss7,
});
