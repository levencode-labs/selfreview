import { detectRedux1 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const redux1 = astRule({
    id: "REDUX-1",
    severity: "SHOULD",
    title: "Типизируй sagaSelectors — иначе не поймаешь смену модели контроллера",
    appliesTo: (path) => /\.ts$/.test(path) && /sagas?Selectors\.ts$/i.test(path),
    detector: detectRedux1,
});
