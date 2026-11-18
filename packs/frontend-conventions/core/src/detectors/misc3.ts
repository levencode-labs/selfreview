import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";

const COMMENTED_TEST_RE = /^\s*(it|test|describe)\s*\(/;

/** MISC-3 — тесты: skip вместо комментирования (по AST-comments). */
export function detectMisc3(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program?.comments) return [];
    const findings: Finding[] = [];

    for (const comment of program.comments) {
        if (comment.type !== "Line") continue;
        if (!COMMENTED_TEST_RE.test(comment.value)) continue;
        findings.push(
            makeFinding(
                "MISC-3",
                "MUST",
                `Закомментированный тест — используй it.skip/test.skip/describe.skip, не комментируй (MISC-3)`,
                filePath,
                comment.loc
                    ? {
                          start: { line: comment.loc.start.line, column: comment.loc.start.column },
                          end: { line: comment.loc.end.line, column: comment.loc.end.column },
                      }
                    : undefined,
            ),
        );
    }

    return findings;
}
