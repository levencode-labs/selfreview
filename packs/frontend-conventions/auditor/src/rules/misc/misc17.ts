import { detectMisc17 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const misc17 = astRule({
    id: "MISC-17",
    severity: "SHOULD",
    title: "Длинная функция внутри компонента — вынеси логику в helpers/",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectMisc17,
});
