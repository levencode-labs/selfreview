import { detectFs13 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const fs13 = contextRule({
    id: "FS-13",
    severity: "MUST",
    title: "Файлы в slices/ называются <сущность>Slice",
    appliesTo: (path) => /\.ts$/.test(path) && path.split("/").slice(-2, -1)[0] === "slices",
    fileLevel: true,
    usesAst: false,
    detector: detectFs13,
});
