import { detectMisc16 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const misc16 = contextRule({
    id: "MISC-16",
    severity: "SHOULD",
    title: "Константы-литералы в .tsx — в constants.ts (не через SCREAMING_SNAKE — свой срез)",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectMisc16,
});
