import { detectReact4 } from "../../../../core/src/index.js";
import { astRule } from "../utils.js";

export const react4 = astRule({
    id: "REACT-4",
    severity: "MUST",
    title: "useEffect deps — не routeMatch/location целиком",
    appliesTo: (path) => /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts"),
    detector: detectReact4,
});
