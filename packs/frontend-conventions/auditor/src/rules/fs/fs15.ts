import { detectFs15 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const fs15 = contextRule({
    id: "FS-15",
    severity: "SHOULD",
    title: "Хелпер в helpers/ обязан иметь тест __tests__/helpers/<name>.test.ts",
    appliesTo: (path) => /(^|\/)helpers\/[^/]+\.ts$/.test(path),
    fileLevel: true,
    usesAst: false,
    detector: detectFs15,
});
