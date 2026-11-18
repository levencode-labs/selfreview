import { detectUrl2 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const url2 = astRule({
    id: "URL-2",
    severity: "MUST",
    title: "Параметры маршрута — через useParams, не пропом через полстраницы",
    appliesTo: (path) => /\.tsx$/.test(path),
    detector: detectUrl2,
});
