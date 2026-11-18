import { detectUrl1 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const url1 = astRule({
    id: "URL-1",
    severity: "MUST",
    title: "ajax — сгенеренные методы из App/server, не Url.Action/ручной fetch",
    appliesTo: (path) => /\.(ts|tsx)$/.test(path) && !/\/server\//.test(path),
    detector: detectUrl1,
});
