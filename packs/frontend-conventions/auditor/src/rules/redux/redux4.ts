import { detectRedux4 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const redux4 = astRule({
    id: "REDUX-4",
    severity: "MUST",
    title: "Строковые енамы, без template-строк в actions",
    appliesTo: (path) => /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts"),
    detector: detectRedux4,
});
