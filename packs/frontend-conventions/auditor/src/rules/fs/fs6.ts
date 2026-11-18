import { detectFs6 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const fs6 = astRule({
    id: "FS-6",
    severity: "MUST",
    title: "View-селектор называется get<Что>ViewModel",
    appliesTo: (path) => /\.(ts|tsx)$/.test(path) && /selectors/i.test(path),
    detector: detectFs6,
});
