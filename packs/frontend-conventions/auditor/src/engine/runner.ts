import type { FileDiff, Finding, Rule, RuleContext } from "./types.js";
import { type FrontendConfig, disabledRuleIdsInSource, isIgnored } from "./config.js";
import { isScssFile, isTsFile, parseTs, scanScssClassTokens } from "./parseSource.js";
import type { InternalDiagnostic } from "./diagnostics.js";
import { DuplicateFunctionIndex, duplicateCodeId, supportsDuplicateCheck } from "./duplicates.js";

export interface RunOptions {
    repoRoot: string;
    files: FileDiff[];
    readSource: (file: FileDiff) => string;
    readRelatedSource?: (path: string) => string | undefined;
    hasRelatedFile?: (file: FileDiff, path: string) => boolean;
    listRelatedFiles?: (directory: string) => string[];
    rules: Rule[];
    includeDuplicates?: boolean;
    config: FrontendConfig;
    /** если передан — собирает внутренние диагностики (правило упало / не спарсилось и т.п.) */
    onInternalDiagnostic?: (diagnostic: InternalDiagnostic) => void;
}

export function runRules(options: RunOptions): Finding[] {
    const { repoRoot, files, readSource, rules, config, onInternalDiagnostic, hasRelatedFile, listRelatedFiles } = options;
    const activeRules = rules.filter((r) => !config.disable.includes(r.id));

    const findings: Finding[] = [];
    const duplicates = options.includeDuplicates && !config.disable.includes(duplicateCodeId) ? new DuplicateFunctionIndex() : undefined;

    for (const file of files) {
        if (isIgnored(file.path, config)) continue;
        const scanDuplicates = duplicates && isTsFile(file.path) && supportsDuplicateCheck(file.path);

        const applicable = activeRules.filter((r) => r.appliesTo(file.path));
        if (applicable.length === 0 && !scanDuplicates) continue;

        let sourceText: string;
        try {
            sourceText = readSource(file);
        } catch (e) {
            onInternalDiagnostic?.({
                code: "SOURCE_READ_FAILED",
                file: file.path,
                message: e instanceof Error ? e.message : String(e),
            });
            continue; // бинарник/не читается — пропускаем
        }

        const inlineDisabled = disabledRuleIdsInSource(sourceText);

        // Правило крита: файл парсится ОДИН раз, AST и SCSS-токены переиспользуются всеми правилами.
        let ast: RuleContext["ast"] = undefined;
        if ((scanDuplicates || applicable.some((r) => r.usesAst)) && isTsFile(file.path)) {
            ast = parseTs(sourceText, file.path);
            if (ast === null) {
                onInternalDiagnostic?.({
                    code: "PARSE_FAILED",
                    file: file.path,
                    message: "typescript-estree не смог разобрать файл",
                });
            }
        }

        if (scanDuplicates && ast && !inlineDisabled.has(duplicateCodeId)) duplicates?.add(file, ast);

        let scssTokens: RuleContext["scssTokens"] = undefined;
        if (applicable.some((r) => r.usesScssTokens) && isScssFile(file.path)) {
            scssTokens = scanScssClassTokens(sourceText);
        }

        const ctx: RuleContext = {
            file,
            sourceText,
            repoRoot,
            ast,
            scssTokens,
            readRelatedSource: options.readRelatedSource,
            hasRelatedFile: hasRelatedFile && (path => hasRelatedFile(file, path)),
            listRelatedFiles: file.readFromWorktree ? undefined : listRelatedFiles,
        };

        for (const rule of applicable) {
            if (inlineDisabled.has(rule.id)) continue;
            let ruleFindings: Finding[];
            try {
                ruleFindings = rule.check(ctx);
            } catch (e) {
                onInternalDiagnostic?.({
                    code: "RULE_EXECUTION_FAILED",
                    file: file.path,
                    ruleId: rule.id,
                    message: e instanceof Error ? e.message : String(e),
                });
                continue; // правило упало на экзотическом файле — не валим весь прогон
            }
            for (const f of ruleFindings) {
                if (!rule.fileLevel && !file.addedLines.has(f.line ?? 0)) continue;
                findings.push(applySeverityOverride(f, config));
            }
        }
    }

    if (duplicates) findings.push(...duplicates.findings());
    return findings;
}

function applySeverityOverride(finding: Finding, config: FrontendConfig): Finding {
    if (config.downgradeToInfo.includes(finding.ruleId)) {
        return { ...finding, severity: "info" };
    }
    return finding;
}
