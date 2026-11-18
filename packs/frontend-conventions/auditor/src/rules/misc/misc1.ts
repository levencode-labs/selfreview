import { detectMisc1 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const misc1 = astRule({
    id: "MISC-1",
    severity: "MUST",
    title: "Utc/Local вместо прямого импорта библиотек дат",
    appliesTo: (path) => /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts"),
    detector: detectMisc1,
});
