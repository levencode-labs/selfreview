import { detectReact9 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const react9 = astRule({
    id: "REACT-9",
    severity: "MUST",
    title: "Не тяни в контейнер ViewModel дочернего компонента",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectReact9,
});
