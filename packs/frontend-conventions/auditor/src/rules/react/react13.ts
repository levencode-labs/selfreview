import { detectReact13 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const react13 = astRule({
    id: "REACT-13",
    severity: "MUST",
    title: "Фича-флаги в компоненте читаем только через селектор, не импортом config/featureFlags",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectReact13,
});
