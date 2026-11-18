import { detectCss1 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const css1 = contextRule({
    id: "CSS-1",
    severity: "MUST",
    title: "camelCase-классы в новых стилях (не дефисные)",
    appliesTo: (path) => /\.(scss|css)$/.test(path),
    usesAst: false,
    detector: detectCss1,
});
