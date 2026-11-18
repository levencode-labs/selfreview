import { detectMisc12 } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

const LOGIC_FILE_RE = /\/(slice|sagas|reducer)\.tsx?$/;
const SELECTORS_FILE_RE = /\/selectors\/(view|saga|validation)Selectors\.tsx?$/;

export const misc12 = contextRule({
    id: "MISC-12",
    severity: "SHOULD",
    title: "Логика фичи меняется, а тестов у фичи нет",
    appliesTo: (path) => LOGIC_FILE_RE.test(path) || SELECTORS_FILE_RE.test(path),
    fileLevel: true,
    usesAst: false,
    detector: detectMisc12,
});
