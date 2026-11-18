import type { Finding, Severity } from "./types.js";
import { getRuleMetadata, getRuleSource, allActiveRules, eslintSupportedRules, manualChecklistRegistry } from "../../../core/src/index.js";
import type { ManualChecklistItem } from "../rules/manualChecklist.js";
import type { InternalDiagnostic } from "./diagnostics.js";
import { describeDiagnostic } from "./diagnostics.js";

const SOURCE_TAG: Record<"wiki" | "mr-pattern", string> = { wiki: "wiki", "mr-pattern": "MR-паттерн" };

const severityOrder: Record<Severity, number> = { BLOCK: 0, MUST: 1, SHOULD: 2, info: 3 };

export function sortFindings(findings: Finding[]): Finding[] {
    return [...findings].sort((a, b) => {
        const bySeverity = severityOrder[a.severity] - severityOrder[b.severity];
        if (bySeverity !== 0) return bySeverity;
        if ((a.file ?? "") !== (b.file ?? "")) return (a.file ?? "").localeCompare(b.file ?? "");
        return (a.line ?? 0) - (b.line ?? 0);
    });
}

export function formatText(findings: Finding[]): string {
    if (findings.length === 0) return "frontend-conventions: нарушений не найдено ✔\n";

    const lines: string[] = [];
    const bySeverity: Record<Severity, Finding[]> = { BLOCK: [], MUST: [], SHOULD: [], info: [] };
    for (const f of findings) bySeverity[f.severity].push(f);

    for (const severity of ["BLOCK", "MUST", "SHOULD", "info"] as Severity[]) {
        const group = bySeverity[severity];
        if (group.length === 0) continue;
        lines.push(`\n== ${severity} (${group.length}) ==`);
        for (const f of group) {
            lines.push(`${f.file}:${f.line}${f.column ? `:${f.column}` : ""}  [${f.ruleId} · ${SOURCE_TAG[getRuleSource(f.ruleId)]}]  ${f.message}`);
        }
    }
    lines.push(
        `\nИтого: ${findings.length} (BLOCK ${bySeverity.BLOCK.length}, MUST ${bySeverity.MUST.length}, SHOULD ${bySeverity.SHOULD.length}, info ${bySeverity.info.length})`,
    );
    return lines.join("\n") + "\n";
}

export function formatChecklist(items: ManualChecklistItem[]): string {
    const lines: string[] = [];
    lines.push(`\n== Ручной чек-лист (не проверяется автоматически, ${items.length}) ==`);
    for (const item of items) {
        lines.push(`[${item.id}] ${item.text}  (почему не авто: ${item.why})`);
    }
    return lines.join("\n") + "\n";
}

export function formatJson(findings: Finding[], checklist?: ManualChecklistItem[]): string {
    return JSON.stringify({ findings, ...(checklist ? { manualChecklist: checklist } : {}) }, null, 2);
}

const SARIF_LEVEL: Record<Severity, "error" | "warning" | "note"> = {
    BLOCK: "error",
    MUST: "error",
    SHOULD: "warning",
    info: "note",
};

export function formatSarif(findings: Finding[], toolVersion: string): string {
    const ruleIds = [...new Set(findings.map((f) => f.ruleId))];
    const sarif = {
        $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
        version: "2.1.0",
        runs: [
            {
                tool: {
                    driver: {
                        name: "frontend-conventions",
                        version: toolVersion,
                        rules: ruleIds.map((id) => ({ id, ...(getRuleMetadata(id) ? { shortDescription: { text: getRuleMetadata(id)!.title } } : {}) })),
                    },
                },
                results: findings.map((f) => ({
                    ruleId: f.ruleId,
                    level: SARIF_LEVEL[f.severity],
                    message: { text: f.message },
                    locations: [
                        {
                            physicalLocation: {
                                artifactLocation: { uri: f.file },
                                region: {
                                    startLine: f.line,
                                    ...((f.column ?? undefined) !== undefined ? { startColumn: f.column } : {}),
                                },
                            },
                        },
                    ],
                })),
            },
        ],
    };
    return JSON.stringify(sarif, null, 2);
}

export interface FormatRulesOptions {
    eslintOnly?: boolean;
}

/** Реестр правил из shared core — единый источник, из него же генерируется docs/rules.md. */
export function formatRules(options: FormatRulesOptions = {}): string {
    const rows: string[] = [];
    const rules = options.eslintOnly ? eslintSupportedRules() : allActiveRules();

    if (options.eslintOnly) {
        rows.push(`Правила, доступные через ESLint-плагин (@selfreview/eslint-plugin-conventions): всего ${rules.length}\n`);
    } else {
        rows.push(`Правила frontend-conventions: ${rules.length} активных автоматических + ${manualChecklistRegistry.length} ручного чек-листа.\n`);
    }

    const byCategory = new Map<string, typeof rules>();
    for (const r of rules) {
        if (!byCategory.has(r.category)) byCategory.set(r.category, []);
        byCategory.get(r.category)!.push(r);
    }

    for (const [category, items] of [...byCategory.entries()].sort()) {
        rows.push(`## ${category}`);
        rows.push(`| ID | Правило | Severity | Источник | Scope | ESLint | Fix |`);
        rows.push(`| --- | --- | --- | --- | --- | --- | --- |`);
        for (const r of items) {
            rows.push(
                `| ${r.id} | ${r.title} | ${r.severity} | ${SOURCE_TAG[r.source]} | ${r.scope} | ${r.eslint.supported ? "✔" : "—"}${r.eslint.supported ? "" : ` (${r.eslint.reason ?? ""})`} | ${r.fixKind} |`,
            );
        }
        rows.push("");
    }

    if (!options.eslintOnly) {
        rows.push(`## Ручной чек-лист (${manualChecklistRegistry.length})`);
        for (const item of manualChecklistRegistry) {
            rows.push(`- [${item.id}] ${item.text} — почему не авто: ${item.why}`);
        }
        rows.push("");
    }

    return rows.join("\n") + "\n";
}

export function formatDiagnostics(diagnostics: InternalDiagnostic[]): string {
    if (diagnostics.length === 0) return "";
    const lines: string[] = [`\n== Внутренние диагностики движка (${diagnostics.length}) ==`];
    for (const d of diagnostics) {
        lines.push(`⚠ ${describeDiagnostic(d)}`);
    }
    return lines.join("\n") + "\n";
}
