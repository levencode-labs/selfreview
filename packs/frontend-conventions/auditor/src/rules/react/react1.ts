import { detectReact1 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const react1 = astRule({
    id: "REACT-1",
    severity: "MUST",
    title: "Только функциональные компоненты",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectReact1,
});
