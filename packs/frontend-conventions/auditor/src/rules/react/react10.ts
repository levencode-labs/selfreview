import { detectReact10 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const react10 = contextRule({
    id: "REACT-10",
    severity: "SHOULD",
    title: "make*ViewModel через useSelectorBuilder, не useSelector(make...())",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectReact10,
});
