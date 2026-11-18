import { detectRui2 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const rui2 = contextRule({
    id: "RUI-2",
    severity: "SHOULD",
    title: "Кастомный компонент с именем как в react-ui — посмотри аналог",
    appliesTo: (path) => /\.tsx$/.test(path) && path.includes("/components/"),
    fileLevel: true,
    detector: detectRui2,
});
