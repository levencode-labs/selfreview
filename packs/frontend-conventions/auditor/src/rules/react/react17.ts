import { detectReact17, getRuleMetadata } from "../../../../core/src/index.js";
import { contextRule } from "../utils.js";

const metadata = getRuleMetadata("REACT-17")!;

export const react17 = contextRule({
    id: metadata.id,
    severity: metadata.severity,
    title: metadata.title,
    appliesTo: path => path.endsWith(".tsx"),
    detector: detectReact17,
});
