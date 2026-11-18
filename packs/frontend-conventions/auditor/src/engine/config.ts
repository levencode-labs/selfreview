import { profile } from "../../../core/src/index.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface FrontendConfig {
    /** ID правил, которые надо выключить */
    disable: string[];
    /** ID правил, для которых severity понижается до info (не влияет на exit code) */
    downgradeToInfo: string[];
    /** glob-подстроки путей, которые тулза вообще не проверяет (легаси и т.п.) */
    ignore: string[];
}

export const defaultConfig: FrontendConfig = {
    disable: [],
    downgradeToInfo: [],
    ignore: [],
};

export function loadConfig(repoRoot: string): FrontendConfig {
    const path = join(repoRoot, profile.configFile);
    if (!existsSync(path)) return defaultConfig;
    try {
        const raw = JSON.parse(readFileSync(path, "utf8"));
        return {
            disable: raw.disable ?? [],
            downgradeToInfo: raw.downgradeToInfo ?? [],
            ignore: raw.ignore ?? [],
        };
    } catch {
        return defaultConfig;
    }
}

export function isIgnored(path: string, config: FrontendConfig): boolean {
    return config.ignore.some((pattern) => path.includes(pattern));
}

/** билд-инлайн исключение в самом файле: // frontend-conventions-disable RULE-ID [, RULE-ID...] */
const disableCommentRe = new RegExp(profile.disableDirective + String.raw`\s+([A-Z0-9,\s-]+)`);

export function disabledRuleIdsInSource(sourceText: string): Set<string> {
    const ids = new Set<string>();
    for (const line of sourceText.split("\n")) {
        const m = line.match(disableCommentRe);
        if (m) {
            for (const id of m[1].split(",")) {
                const trimmed = id.trim();
                if (trimmed) ids.add(trimmed);
            }
        }
    }
    return ids;
}
