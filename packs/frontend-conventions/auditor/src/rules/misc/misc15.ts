import { detectMisc15 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const misc15 = astRule({
    id: "MISC-15",
    severity: "SHOULD",
    title: "Магические числа в компонентах — выноси в constants",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectMisc15,
});
