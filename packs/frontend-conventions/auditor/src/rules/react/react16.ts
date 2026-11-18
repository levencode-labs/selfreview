import { detectReact16 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const react16 = contextRule({
    id: "REACT-16",
    severity: "SHOULD",
    title: "Одна собственная ViewModel на компонент",
    appliesTo: path => path.endsWith(".tsx"),
    detector: detectReact16,
});
