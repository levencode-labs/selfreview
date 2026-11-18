import { detectFs4 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const fs4 = contextRule({
    id: "FS-4",
    severity: "info",
    title: "Большой вложенный компонент — рассмотри перенос в App/components",
    appliesTo: (path) => /\.tsx$/.test(path),
    fileLevel: true,
    usesAst: false,
    detector: detectFs4,
});
