import { detectFs12 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const fs12 = astRule({
    id: "FS-12",
    severity: "SHOULD",
    title: "Несколько Route одного раздела — в <Раздел>RoutesGroup/Routes, не россыпью",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectFs12,
});
