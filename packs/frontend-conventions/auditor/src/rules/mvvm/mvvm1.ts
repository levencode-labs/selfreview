import { detectMvvm1 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const mvvm1 = astRule({
    id: "MVVM-1",
    severity: "SHOULD",
    title: "Вложенный тернарник в JSX — логика отображения, вынеси в селектор",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectMvvm1,
});
