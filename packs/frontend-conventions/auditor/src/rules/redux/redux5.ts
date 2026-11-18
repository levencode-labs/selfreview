import { detectRedux5 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const redux5 = contextRule({
    id: "REDUX-5",
    severity: "MUST",
    title: "payload экшена — объект",
    appliesTo: (path) => /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts"),
    detector: detectRedux5,
});
