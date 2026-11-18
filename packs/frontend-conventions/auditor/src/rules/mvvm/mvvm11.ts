import { detectMvvm11 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const mvvm11 = contextRule({
    id: "MVVM-11",
    severity: "SHOULD",
    title: "Методы массивов на useSelector в компоненте — вынеси в view-селектор",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectMvvm11,
});
