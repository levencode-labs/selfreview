import { detectReact15 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const react15 = astRule({
    id: "REACT-15",
    severity: "MUST",
    title: "Без аннотации :FC / :React.FC — тип пропсов выводится",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectReact15,
});
