import { detectRedux6 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const redux6 = astRule({
    id: "REDUX-6",
    severity: "MUST",
    title: "Асинхронные экшены fetch/save + Begin/Success/Error",
    appliesTo: (path) => /\.ts$/.test(path) && /slice\.ts$/.test(path),
    detector: detectRedux6,
});
