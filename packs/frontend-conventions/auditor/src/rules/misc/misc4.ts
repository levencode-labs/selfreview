import { detectMisc4 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const misc4 = contextRule({
    id: "MISC-4",
    severity: "MUST",
    title: "Хелперы enum/моделей называем по имени сущности",
    appliesTo: (path) => /\.ts$/.test(path) && path.split("/").pop() === "helpers.ts",
    fileLevel: true,
    usesAst: false,
    detector: detectMisc4,
});
