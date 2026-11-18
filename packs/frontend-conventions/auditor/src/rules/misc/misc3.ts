import { detectMisc3 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const misc3 = astRule({
    id: "MISC-3",
    severity: "MUST",
    title: "Тесты: skip вместо комментирования",
    appliesTo: (path) => /\.(ts|tsx)$/.test(path),
    detector: detectMisc3,
});
