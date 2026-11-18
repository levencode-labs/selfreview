import { detectMvvm7 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const mvvm7 = contextRule({
    id: "MVVM-7",
    severity: "MUST",
    title: "redux-toolkit слайсы вместо рукописных actions.ts/reducers.ts; корневой редьюсер — через combineReducers",
    fileLevel: true,
    appliesTo: path => /\.ts$/.test(path),
    detector: detectMvvm7,
});
