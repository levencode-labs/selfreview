import { detectTs2 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const ts2 = astRule({
    id: "TS-2",
    severity: "SHOULD",
    title: "Избыточные === true / === false",
    appliesTo: (path) => /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts"),
    detector: detectTs2,
});
