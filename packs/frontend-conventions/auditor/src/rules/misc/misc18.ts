import { detectMisc18 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const misc18 = astRule({
    id: "MISC-18",
    severity: "MUST",
    title: "Одно-буквенные идентификаторы не используем (исключения: _, i/j/k)",
    appliesTo: (path) => /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts"),
    detector: detectMisc18,
});
