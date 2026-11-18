import { detectFs5 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const fs5 = contextRule({
    id: "FS-5",
    severity: "MUST",
    title: "Именование файлов (camelCase, кроме именованных сущностей)",
    appliesTo: (path) => /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts") && !/\/server\//.test(path),
    fileLevel: true,
    detector: detectFs5,
});
