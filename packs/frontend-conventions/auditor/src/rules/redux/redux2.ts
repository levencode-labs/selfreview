import { detectRedux2 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const redux2 = astRule({
    id: "REDUX-2",
    severity: "MUST",
    title: "getRoot типизирован через With*",
    appliesTo: (path) => /\.ts$/.test(path) && /(baseSelectors|selectors)\.ts$/.test(path),
    detector: detectRedux2,
});
