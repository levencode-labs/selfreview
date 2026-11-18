import { detectFs1 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const fs1 = contextRule({
    id: "FS-1",
    severity: "MUST",
    title: "Один компонент = одна папка",
    appliesTo: (path) => /\.tsx$/.test(path) && path.includes("/components/"),
    fileLevel: true,
    detector: detectFs1,
});
