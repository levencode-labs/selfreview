import { detectCss2 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const css2 = contextRule({
    id: "CSS-2",
    severity: "SHOULD",
    title: "Custom properties в :root пока не используем",
    appliesTo: (path) => /\.(scss|css)$/.test(path),
    usesAst: false,
    detector: detectCss2,
});
