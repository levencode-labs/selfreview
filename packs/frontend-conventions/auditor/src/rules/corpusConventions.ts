import { corpusRulePaths, detectorsByRuleId, getRuleMetadata } from "../../../core/src/index.js";
import { contextRule } from "./utils.js";

export const corpusRules = (Object.keys(corpusRulePaths) as Array<keyof typeof corpusRulePaths>).map(id => {
    const { severity, title } = getRuleMetadata(id)!;
    return contextRule({
        id,
        severity,
        title,
        appliesTo: (path: string) => corpusRulePaths[id](path.replace(/\\/g, "/")),
        detector: detectorsByRuleId[id],
        fileLevel: id === "FS-16",
    });
});
