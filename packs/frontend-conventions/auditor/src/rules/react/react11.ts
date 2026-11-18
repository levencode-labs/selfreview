import { detectReact11 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const react11 = contextRule({
    id: "REACT-11",
    severity: "MUST",
    title: "Данные компонента — только из своей фичи (не читай чужую)",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectReact11,
});
