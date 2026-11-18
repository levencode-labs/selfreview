import { detectTs3 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const ts3 = astRule({
    id: "TS-3",
    severity: "MUST",
    title: "Мёртвый код: console.log остался",
    appliesTo: (path) => /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts"),
    detector: detectTs3,
});
