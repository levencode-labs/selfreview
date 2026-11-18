import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";

const HELPERS_SEG = "/helpers/";

/**
 * FS-15: хелпер в helpers/ обязан иметь тест __tests__/<name>.test.ts (или <name>.test.ts рядом).
 * Проверка per-file через файловую систему (нужен repoRoot) — в ESLint работает в review-пресете.
 * Severity — SHOULD: логика хелперов — лучший кандидат на юнит-покрытие фичи.
 */
export function detectFs15(
    _program: import("@typescript-eslint/typescript-estree").TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    const repoRoot = state.repoRoot;
    if (!repoRoot) return [];
    if (state.isDeleted) return [];

    const rootNorm = repoRoot.replace(/\\/g, "/").replace(/\/$/, "");
    let norm = filePath.replace(/\\/g, "/");
    if (norm.startsWith(rootNorm)) norm = norm.slice(rootNorm.length).replace(/^\//, "");
    if (!norm.endsWith(".ts")) return [];

    const idx = norm.lastIndexOf(HELPERS_SEG);
    if (idx === -1) return [];
    const featureDir = norm.slice(0, idx); // "...;TарифListPage" — каталог, где лежит helpers/
    const dir = featureDir + "/helpers";
    const fileName = norm.slice(idx + HELPERS_SEG.length);
    if (!/^[^/]+\.ts$/.test(fileName)) return [];
    const name = fileName.slice(0, -3); // базовая часть без .ts
    if (/\.(?:test|spec)$/.test(name) || name === "index") return [];

    const candidates = [
        featureDir + "/__tests__/helpers/" + name,
        dir + "/__tests__/" + name,
        dir + "/" + name,
    ].flatMap(stem => [stem + ".test.ts", stem + ".test.tsx", stem + ".spec.ts", stem + ".spec.tsx"]);
    const exists = state.hasFile ?? (path => existsSync(join(repoRoot, path)));
    if (candidates.some(exists)) return [];

    return [
        makeFinding(
            "FS-15",
            "SHOULD",
            `У хелпера "${name}.ts" нет одноимённого теста в стандартных путях — проверь покрытие его нетривиальной логики (FS-15)`,
            filePath,
            { start: { line: 1, column: 0 } },
        ),
    ];
}
