import type { Detector, DetectorState, RuleMetadata } from "../../core/src/index.js";
import type { Rule } from "eslint";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type ReportLoc =
    | { start: { line: number; column: number }; end: { line: number; column: number } }
    | { line: number; column: number };

/** Резолвер вне-AST контекста (git-статус и т.п.) для правил уровня файла/нового файла. */
export type StateResolver = (cwd: string, filename: string) => DetectorState;

/**
 * ONE-TO-ONE фабрика ESLint-правила над общим детектором core.
 * Парсит Program (typescript-eslint парсер) и прогоняет тот же детектор, что и auditor, —
 * parity by construction: ESLint и CLI дают одинаковые замечания на один и тот же код.
 *
 * stateResolver подменяем напрямую через опцию правила:
 *   "frontend/fs-5": ["error", { state: { isNew: true } }]  — принудительный статус (для тестов/CI)
 */
export function createRule(
    meta: RuleMetadata,
    detector: Detector,
    appliesTo: (path: string) => boolean,
    stateResolver?: StateResolver,
): Rule.RuleModule {
    return {
        meta: {
            type: "problem",
            docs: { description: meta.title },
            fixable: meta.fixKind === "safe-fix" ? "code" : undefined,
            hasSuggestions: meta.fixKind === "suggestion",
            // Разрешаем одну опцию — вне-AST контекст: { state: { isNew, repoRoot, ... } }
            // (тесты/CI переопределяют статус файла без git). Без schema ESLint запретил бы опции.
            schema: [
                {
                    type: "object",
                    properties: { state: { type: "object", additionalProperties: true } },
                    additionalProperties: true,
                },
            ],
        },
        create(context) {
            return {
                Program(node) {
                    const filename = context.filename ?? (context as Rule.RuleContext).getFilename();
                    if (!appliesTo(filename)) return;

                    const sourceText = context.sourceCode.getText();

                    let state: DetectorState = {};
                    const option = (context.options ?? [])[0] as { state?: DetectorState } | undefined;
                    if (option && typeof option === "object" && option.state && typeof option.state === "object") {
                        state = option.state; // явный статус — приоритетнее (тесты/CI)
                    } else if (stateResolver) {
                        const cwd = (context as { cwd?: string }).cwd ?? process.cwd();
                        try {
                            state = stateResolver(cwd, filename) ?? {};
                        } catch {
                            state = {};
                        }
                    }

                    if (["REDUX-5", "REACT-10"].includes(meta.id) && !state.readSource) {
                        state = { ...state, readSource: (path) => {
                            try { return readFileSync(resolve(state.repoRoot ?? context.cwd ?? process.cwd(), path), "utf8"); }
                            catch (error) {
                                if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
                                throw error;
                            }
                        } };
                    }
                    const findings = detector(node as never, sourceText, filename, state);
                    for (const finding of findings) {
                        const loc: ReportLoc =
                            finding.loc?.start && finding.loc?.end
                                ? { start: finding.loc.start, end: finding.loc.end }
                                : { line: finding.line ?? 1, column: Math.max((finding.column ?? 1) - 1, 0) };

                        context.report({
                            loc,
                            message: finding.message,
                            ...(finding.fix
                                ? { fix: (fixer) => fixer.replaceTextRange([finding.fix!.range[0], finding.fix!.range[1]], finding.fix!.text) }
                                : {}),
                            ...(finding.suggestions
                                ? {
                                      suggest: finding.suggestions.map((s) => ({
                                          desc: s.desc,
                                          fix: (fixer) => fixer.replaceTextRange([s.fix.range[0], s.fix.range[1]], s.fix.text),
                                      })),
                                  }
                                : {}),
                        });
                    }
                },
            };
        },
    };
}
