import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";

const FEATURE_FLAGS_RE = /(^|\/)config\/featureFlags$/;

/**
 * REACT-13: фича-флаги в компоненте напрямую не читаем — флаги приходят через селектор фичи,
 * а не через прямой `import { flags } from ".../config/featureFlags"` в .tsx.
 * Severity — MUST (фича-флаг — внешняя зависимость; компонент о ней знать не должен).
 */
export function detectReact13(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    _state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!program || !/\.tsx$/.test(filePath)) return [];

    const findings: Finding[] = [];
    for (const stmt of program.body) {
        if (stmt.type !== "ImportDeclaration") continue;
        const source = typeof stmt.source?.value === "string" ? stmt.source.value : "";
        if (!FEATURE_FLAGS_RE.test(source)) continue;
        if (!stmt.loc) continue;

        findings.push(
            makeFinding(
                "REACT-13",
                "MUST",
                `Импорт feature-флагов из "${source}" в компоненте — флаги читаем только через селектор (getIsFeatureEnabledViewModel в viewSelectors), не через config напрямую (REACT-13)`,
                filePath,
                { start: { line: stmt.loc.start.line, column: stmt.loc.start.column } },
            ),
        );
    }

    return findings;
}
