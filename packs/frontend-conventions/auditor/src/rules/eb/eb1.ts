import { detectEb1 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const eb1 = astRule({
    id: "EB-1",
    severity: "MUST",
    title: "ErrorBoundary — ХОК, не через connect",
    appliesTo: (path) => /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts"),
    detector: detectEb1,
});
