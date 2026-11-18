import { detectReact2 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const react2 = astRule({
    id: "REACT-2",
    severity: "SHOULD",
    title: "React.memo на компоненте без пропсов — бесполезен",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectReact2,
});
