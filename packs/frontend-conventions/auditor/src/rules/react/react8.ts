import { detectReact8 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const react8 = astRule({
    id: "REACT-8",
    severity: "SHOULD",
    title: "В class-компонентах — без constructor, если можно обойтись",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectReact8,
});
