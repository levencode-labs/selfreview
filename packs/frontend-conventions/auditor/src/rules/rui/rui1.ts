import { detectRui1 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const rui1 = astRule({
    id: "RUI-1",
    severity: "MUST",
    title: "Гранулярные иконки из @example/icons",
    appliesTo: (path) => /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts"),
    detector: detectRui1,
});
