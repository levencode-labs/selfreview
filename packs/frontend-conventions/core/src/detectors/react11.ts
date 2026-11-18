import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { walk, dirname } from "../ast/walk.js";
import { resolve } from "node:path";

/** Хуки, которыми компонент читает селекторы/VM (actions к селекторам не относятся). */
const DATA_HOOKS = new Set(["useSelector", "useSelectorBuilder"]);
/** Границы фичи: .../components/<Feature>/ | .../widgets/<Feature>/ | .../pages/<Feature>/
 * (lookbehind/lookahead не «съедают» разделители — позволяют найти все границы подряд). */
const FEATURE_RE = /(?<=^|\/)(components|widgets|pages)\/([^/\s]+)(?=\/)/g;

/** Все границы фич в пути от мелкой к глубокой. */
function featureList(path: string): string[] {
    const out: string[] = [];
    for (const m of path.matchAll(FEATURE_RE)) out.push(`${m[1]}/${m[2]}`);
    return out;
}

interface ImportInfo {
    source: string;
    importedName: string;
}

function effectiveSource(source: string, filePath: string): string {
    if (!source.startsWith(".")) return source;
    return resolve(dirname(filePath).replace(/\\/g, "/"), source).replace(/\\/g, "/");
}

/**
 * REACT-11: компонент читает ViewModel только из своей фичи.
 * Своя фича = любая из цепочки предков пути файла: читать селекторы фичи, внутри которой лежит
 * компонент (на любой глубине), — норма (MVVM-9: view-селекторы в корне фичи). Нарушение —
 * селекторы из фичи, которая НЕ является предком (соседняя/независимая ветка, components/<Other>).
 * useSelectorBuilder — санкционированный мостик для factory-селекторов (make*ViewModel), не флагаем.
 * useActions к селекторам не относится. Для НОВЫХ файлов — MUST, для существующих — SHOULD.
 */
export function detectReact11(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!program || !/\.tsx$/.test(filePath)) return [];

    const normalizedPath = filePath.replace(/\\/g, "/");
    const features = featureList(normalizedPath);
    if (features.length === 0) return []; // вне фичи (top-level/shared) — не оцениваем
    // Разрешены любые фичи из цепочки предков файла (своя фича и все, внутри которых он лежит).
    const allowedFeatures = new Set(features);

    const imports = new Map<string, ImportInfo>();
    for (const stmt of program.body) {
        if (stmt.type !== "ImportDeclaration" || typeof stmt.source?.value !== "string") continue;
        const source = stmt.source.value;
        for (const spec of stmt.specifiers) {
            if (spec.type === "ImportSpecifier") {
                const importedName = spec.imported.type === "Identifier" ? spec.imported.name : spec.imported.value;
                imports.set(spec.local.name, { source, importedName });
            } else {
                imports.set(spec.local.name, { source, importedName: spec.local.name });
            }
        }
    }
    if (imports.size === 0) return [];

    const findings: Finding[] = [];
    const severity: "MUST" | "SHOULD" = state.isNew ? "MUST" : "SHOULD";

    walk(program, (n) => {
        if (n.type !== "CallExpression") return;
        if (n.callee.type !== "Identifier" || !DATA_HOOKS.has(n.callee.name)) return;
        if (n.callee.name === "useSelectorBuilder") return; // мостик для make*ViewModel — ок
        const arg = n.arguments[0];
        if (!arg || arg.type !== "Identifier") return;

        const info = imports.get(arg.name);
        if (!info) return;

        const targetPath = effectiveSource(info.source, normalizedPath);
        const targetFeatures = featureList(targetPath);
        if (targetFeatures.length === 0) return; // без границы фичи (shared/... и т.п.) — не наша тема
        const targetFeature = targetFeatures[targetFeatures.length - 1];
        if (allowedFeatures.has(targetFeature)) return; // фича из цепочки предков файла — ок

        findings.push(
            makeFinding(
                "REACT-11",
                severity,
                severity === "MUST"
                    ? `Данные нового компонента "${features[features.length - 1]}" приходят из чужой фичи "${targetFeature}" (${info.importedName} из ${info.source}) — у фичи должны быть свои selectors/slice, а не чтение чужой (REACT-11)`
                    : `Компонент "${features[features.length - 1]}" читает данные из чужой фичи "${targetFeature}" (${info.importedName} из ${info.source}) — перенеси селекторы/actions в свою фичу (REACT-11)`,
                filePath,
                { start: { line: n.loc.start.line, column: n.loc.start.column } },
            ),
        );
    });

    return findings;
}
