import { detectFs14 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const fs14 = contextRule({
    id: "FS-14",
    severity: "MUST",
    title: "Тесты — в __tests__/",
    appliesTo: (path) => /\.test\.(ts|tsx)$/.test(path),
    fileLevel: true,
    usesAst: false,
    detector: detectFs14,
});
