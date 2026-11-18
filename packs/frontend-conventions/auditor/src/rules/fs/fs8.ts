import { detectFs8 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const fs8 = astRule({
    id: "FS-8",
    severity: "MUST",
    title: "Экспорт через index именованными сущностями, без дефолтного экспорта",
    appliesTo: (path) => /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts"),
    detector: detectFs8,
});
