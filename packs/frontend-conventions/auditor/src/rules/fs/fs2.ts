import { detectFs2 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const fs2 = contextRule({
    id: "FS-2",
    severity: "SHOULD",
    title: "Вложенность компонентов ≤ 2 уровней",
    appliesTo: (path) => /\.tsx?$/.test(path),
    fileLevel: true,
    usesAst: false,
    detector: detectFs2,
});
