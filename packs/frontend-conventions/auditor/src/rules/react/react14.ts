import { detectReact14 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const react14 = astRule({
    id: "REACT-14",
    severity: "MUST",
    title: "useActions({ ...actions }) — передавай объект действий напрямую",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectReact14,
});
