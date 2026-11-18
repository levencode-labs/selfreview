import { detectRedux9 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

export const redux9 = contextRule({
    id: "REDUX-9",
    severity: "MUST",
    title: "В сагах API вызываем через fetchData, а не напрямую yield call",
    appliesTo: (path) => /(^|\/)(saga|sagas)\.tsx?$/.test(path) || /\/sagas\//.test(path),
    detector: detectRedux9,
});
