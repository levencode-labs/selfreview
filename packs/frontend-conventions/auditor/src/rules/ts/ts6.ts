import { detectTs6 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const ts6 = astRule({
    id: "TS-6",
    severity: "SHOULD",
    title: "Строковые енамы, не числовые",
    appliesTo: (path) => /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts"),
    detector: detectTs6,
});
