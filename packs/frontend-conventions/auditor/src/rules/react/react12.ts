import { detectReact12 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const react12 = contextRule({
    id: "REACT-12",
    severity: "MUST",
    title: "Действия в onClick — только через именованный обработчик handle* (не bindedActions напрямую)",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectReact12,
});
