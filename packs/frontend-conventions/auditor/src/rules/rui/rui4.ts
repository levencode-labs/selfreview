import { detectRui4 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const rui4 = astRule({
    id: "RUI-4",
    severity: "MUST",
    title: "Базовые компоненты (Checkbox/Input/Button/...) — из @example/react-ui, не из legacy-ui-modern/components",
    appliesTo: (path) => /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts"),
    detector: detectRui4,
});
