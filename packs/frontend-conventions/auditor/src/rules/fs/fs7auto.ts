import { detectFs7 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const fs7auto = contextRule({
    id: "FS-7",
    severity: "MUST",
    title: "Константы — в constants, а не в helpers/компонентах",
    appliesTo: (path) =>
        /\.(ts|tsx)$/.test(path) &&
        !path.endsWith(".d.ts") &&
        !/\/server\//.test(path) &&
        !/__tests__/.test(path) &&
        !/constants\.tsx?$/.test(path.split("/").pop() ?? "") &&
        !/\/constants\//.test(path),
    fileLevel: true,
    detector: detectFs7,
});
