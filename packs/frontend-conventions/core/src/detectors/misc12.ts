import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";

const FEATURE_ROOT_RE = /^(.*\/App\/(?:components|pages)\/[^/]+)\//;

/** Есть ли у фичи хоть какие-то тесты: ищем __tests__ или *.test.ts(x) внутри её каталога. */
function hasTests(featureRoot: string, depth = 0): boolean {
    if (depth > 4 || !existsSync(featureRoot)) return false;

    for (const entry of readdirSync(featureRoot)) {
        const full = join(featureRoot, entry);

        if (entry === "node_modules") continue;
        if (entry === "__tests__" || /\.test\.tsx?$/.test(entry)) return true;
        if (statSync(full).isDirectory() && hasTests(full, depth + 1)) return true;
    }

    return false;
}

/**
 * Автоматическая часть MISC-12: меняется логика фичи (слайс/саги/селекторы), а тестов у фичи
 * нет вовсе. Требует repoRoot (файловая система) — в ESLint покрывается review-пресетом.
 */
export function detectMisc12(
    _program: import("@typescript-eslint/typescript-estree").TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (state.isDeleted) return [];

    const featureRoot = FEATURE_ROOT_RE.exec(filePath)?.[1];
    if (!featureRoot) return [];
    const repoRoot = state.repoRoot;
    if (!repoRoot) return [];
    const hasFeatureTests = state.listFiles
        ? state.listFiles(featureRoot).some(path => /\.(?:test|spec)\.tsx?$/.test(path))
        : hasTests(join(repoRoot, featureRoot));
    if (hasFeatureTests) return [];

    return [
        makeFinding(
            "MISC-12",
            "SHOULD",
            `Меняется логика фичи, но в ней нет ни одного теста — покрытие должно доходить до редьюсеров, view/saga-селекторов и нетривиальных веток саг (MISC-12)`,
            filePath,
            { start: { line: 1, column: 0 } },
        ),
    ];
}
