import { detectRui3 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const rui3 = astRule({
    id: "RUI-3",
    severity: "MUST",
    title: "Инлайн-<svg> не используем — иконки из @example/icons",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectRui3,
});
