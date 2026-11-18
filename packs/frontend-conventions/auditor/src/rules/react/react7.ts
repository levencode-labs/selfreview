import { detectReact7 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const react7 = astRule({
    id: "REACT-7",
    severity: "MUST",
    title: "Стрелочные функции в JSX-хендлерах — в именованные обработчики",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectReact7,
});
