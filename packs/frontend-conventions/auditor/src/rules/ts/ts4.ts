import { detectTs4 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const ts4 = astRule({
    id: "TS-4",
    severity: "SHOULD",
    title: "delete obj[key] → деструктуризация",
    appliesTo: (path) => /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts"),
    detector: detectTs4,
});
