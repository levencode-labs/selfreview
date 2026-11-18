import { detectReact3 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const react3 = astRule({
    id: "REACT-3",
    severity: "SHOULD",
    title: "React.Fragment не используем как корневой элемент компонента",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectReact3,
});
