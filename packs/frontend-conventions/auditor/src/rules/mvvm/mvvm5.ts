import { inProfileDirectory, profile } from "../../../../core/src/index.js";
import { detectMvvm5 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const mvvm5 = astRule({
    id: "MVVM-5",
    severity: "SHOULD",
    title: "Локальный стейт компонента — рассмотри перенос в redux",
    appliesTo: (path) => /\.tsx$/.test(path) && path.includes("/components/") && !path.includes("/shared/") && !inProfileDirectory(path, profile.sharedUiDirectory),
    detector: detectMvvm5,
});
