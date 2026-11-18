import { inProfileDirectory, profile } from "../../core/src/index.js";
import { corpusRulePaths, detectorsByRuleId, getRuleMetadata, type DetectorState } from "../../core/src/index.js";
import { createRule, type StateResolver } from "./factory.js";
import { createStateResolver } from "./vcs.js";
import { cssParser } from "./cssParser.js";

/**
 * Файловые фильтры правил — зеркалят appliesTo аудиторных правил (packages/auditor), чтобы
 * ESLint и CLI применяли правило к одному и тому же набору файлов. MVVM-10 дополнительно
 * исключает файлы внутри selectors/ (там правило работает только на уровне auditor/diff).
 */
const FILE_FILTERS: Record<string, (path: string) => boolean> = {
    ...Object.fromEntries(Object.entries(corpusRulePaths).map(([id, appliesTo]) => [id, (path: string) => appliesTo(path.replace(/\\/g, "/"))])),
    "TS-2": (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts"),
    "TS-3": (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts"),
    "TS-4": (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts"),
    "TS-6": (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts"),

    "REACT-1": (p) => /\.tsx$/.test(p),
    "REACT-2": (p) => /\.tsx$/.test(p),
    "REACT-3": (p) => /\.tsx$/.test(p),
    "REACT-4": (p) => /\.tsx$/.test(p),
    "REACT-7": (p) => /\.tsx$/.test(p),
    "REACT-8": (p) => /\.tsx$/.test(p),
    "REACT-9": (p) => /\.tsx$/.test(p),
    "REACT-10": (p) => /\.tsx$/.test(p),
    "REACT-11": (p) => /\.tsx$/.test(p),
    "REACT-12": (p) => /\.tsx$/.test(p),
    "REACT-13": (p) => /\.tsx$/.test(p),
    "REACT-14": (p) => /\.tsx$/.test(p),
    "REACT-15": (p) => /\.tsx$/.test(p),
    "REACT-16": (p) => /\.tsx$/.test(p),
    "REACT-17": (p) => /\.tsx$/.test(p),

    "REDUX-1": (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts"),
    "REDUX-2": (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts"),
    "REDUX-4": (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts"),
    "REDUX-5": (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts"),
    "REDUX-6": (p) => /\.ts$/.test(p) && /slice\.ts$/.test(p),
    "REDUX-9": (p) => /(^|\/)(saga|sagas)\.tsx?$/.test(p) || /\/sagas\//.test(p),

    "MVVM-1": (p) => /\.tsx$/.test(p),
    "MVVM-2": (p) => /viewSelectors\.ts$/.test(p) && p.includes("/selectors/"),
    "MVVM-4": (p) => /\.ts$/.test(p) && /selectors/i.test(p),
    "MVVM-5": (p) => /\.tsx$/.test(p) && p.includes("/components/") && !p.includes("/shared/") && !inProfileDirectory(p, profile.sharedUiDirectory),
    "MVVM-7": (p) => /\.ts$/.test(p) && !p.endsWith(".d.ts"),
    "MVVM-9": (p) => /\.ts$/.test(p) && /\/components\/[^/]+\/components\/[^/]+\/selectors\//.test(p),
    "MVVM-10": (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts") && !/\/selectors\//.test(p),
    "MVVM-11": (p) => /\.tsx$/.test(p),

    "RUI-1": (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts"),
    "RUI-2": (p) => /\.tsx$/.test(p) && p.includes("/components/"),
    "RUI-3": (p) => /\.tsx$/.test(p),
    "RUI-4": (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts"),
    "EB-1": (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts"),
    "URL-1": (p) => /\.(ts|tsx)$/.test(p) && !/\/server\//.test(p),
    "URL-2": (p) => /\.tsx$/.test(p),

    "FS-1": (p) => /\.tsx$/.test(p) && p.includes("/components/"),
    "FS-2": (p) => /\.tsx?$/.test(p),
    "FS-4": (p) => /\.tsx$/.test(p),
    "FS-5": (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts") && !/\/server\//.test(p),
    "FS-6": (p) => /\.(ts|tsx)$/.test(p) && /selectors/i.test(p),
    "FS-7": (p) =>
        /\.(ts|tsx)$/.test(p) &&
        !p.endsWith(".d.ts") &&
        !/\/server\//.test(p) &&
        !/__tests__/.test(p) &&
        !/constants\.tsx?$/.test(p) &&
        !/\/constants\//.test(p),
    "FS-8": (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts"),
    "FS-12": (p) => /\.tsx$/.test(p),
    "FS-13": (p) => /\.ts$/.test(p) && p.split("/").slice(-2, -1)[0] === "slices",
    "FS-14": (p) => /\.test\.(ts|tsx)$/.test(p),
    "FS-15": (p) => /(^|\/)helpers\/[^/]+\.ts$/.test(p.replace(/\\/g, "/")),

    "MISC-1": (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts"),
    "MISC-3": (p) => /\.(ts|tsx)$/.test(p),
    "MISC-4": (p) => /\.ts$/.test(p) && p.split("/").pop() === "helpers.ts",
    "MISC-12": (p) => /\/(slice|sagas|reducer)\.tsx?$/.test(p) || /\/selectors\/(view|saga|validation)Selectors\.tsx?$/.test(p),
    "MISC-15": (p) => /\.tsx$/.test(p),
    "MISC-16": (p) => /\.tsx$/.test(p),
    "MISC-17": (p) => /\.tsx$/.test(p),
    "MISC-18": (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts"),

    "CSS-1": (p) => /\.(scss|css)$/.test(p),
    "CSS-2": (p) => /\.(scss|css)$/.test(p),
    "CSS-3": (p) => /\.(scss|css)$/.test(p),
    "CSS-4": (p) => /\.(scss|css)$/.test(p),
    "CSS-5": (p) => /\.(scss|css)$/.test(p),
    "CSS-6": (p) => /\.module\.(scss|css)$/.test(p),
    "CSS-7": (p) => /\.module\.(scss|css)$/.test(p),
};

/**
 * Правила, которым нужен вне-AST контекст: статус файла (новый/переименованный) и/или repoRoot.
 * Резолвер ходит в git (кэшируется на репозиторий), исходная база — origin/release.
 */
const STATE_BASED_RULES = new Set(["REACT-11", "REACT-12", "MVVM-2", "MVVM-7", "MVVM-9", "FS-1", "FS-2", "FS-4", "FS-5", "FS-13", "FS-14", "FS-15", "FS-16", "MISC-4", "MISC-12", "RUI-2"]);

/**
 * «Шумные» правила: в recommended не входят (по умолчанию ESLint обходит ВСЕ файлы проекта,
 * и эти правила без статуса диффа флагали бы legacy-код). Включаются через frontend.configs.reviewMax.
 */
const NOISY_RULES = new Set(["REACT-16", "REACT-17", "REACT-18", "RUI-5", "FS-16", "MVVM-2", "MVVM-11", "FS-1", "FS-2", "FS-4", "FS-5", "FS-7", "FS-13", "FS-14", "FS-15", "MISC-4", "MISC-12", "MISC-16", "MISC-17", "MISC-18", "RUI-2", "RUI-3", "RUI-4"]);

/** SCSS/CSS-правила работают по тексту — подключаются отдельным конфигом frontend.configs.css. */
const CSS_RULES = new Set(["CSS-1", "CSS-2", "CSS-3", "CSS-4", "CSS-5", "CSS-6", "CSS-7"]);

const stateResolver: StateResolver = createStateResolver("origin/release");

export const ruleIds = Object.keys(detectorsByRuleId);

/** ruleId "TS-2" -> имя ESLint-правила "ts-2" (префикс frontend/ добавляет плагин-неймспейс). */
export function ruleName(ruleId: string): string {
    return ruleId.toLowerCase();
}

export const rules: Record<string, ReturnType<typeof createRule>> = {};
for (const id of ruleIds) {
    const meta = getRuleMetadata(id);
    // На Windows ESLint отдаёт пути с обратным слэшем — нормализуем в POSIX перед матчингом,
    // иначе фильтры с "/" (selectors/, components/, helpers/, /server/ и т.п.) молча не работают.
    const raw = FILE_FILTERS[id];
    const filter = raw ? (p: string) => raw(p.replace(/\\/g, "/")) : (() => true);
    rules[ruleName(id)] = createRule(meta!, detectorsByRuleId[id], filter, STATE_BASED_RULES.has(id) ? stateResolver : undefined);
}

function severityToEslint(meta: NonNullable<ReturnType<typeof getRuleMetadata>>): "error" | "warn" {
    return meta.severity === "MUST" || meta.severity === "BLOCK" ? "error" : "warn";
}

function buildPreset(ruleIds: string[], severityFor: (meta: NonNullable<ReturnType<typeof getRuleMetadata>>) => "error" | "warn"): Record<string, "error" | "warn"> {
    const preset: Record<string, "error" | "warn"> = {};
    for (const id of ruleIds) {
        const meta = getRuleMetadata(id)!;
        preset[`frontend/${ruleName(id)}`] = severityFor(meta);
    }
    return preset;
}

/**
 * Рекомендуемый набор: безопасные per-file правила (без «шумных» и без CSS).
 * MUST — error, SHOULD/info — warn (совпадает с exit code аудитора по умолчанию).
 */
export const recommended = buildPreset(ruleIds.filter((id) => !NOISY_RULES.has(id) && !CSS_RULES.has(id)), (meta) => severityToEslint(meta));

/** Максимальное покрытие: ВСЕ правила (включая новые-файлы, FS-7, MISC-12, CSS). Требует git для статуса «новый файл». */
export const reviewMax = buildPreset(ruleIds, (meta) => severityToEslint(meta));

/** Строгий набор: всё как error, включая SHOULD/info. */
export const strict = buildPreset(ruleIds, () => "error");

/**
 * Готовый flat-config-фрагмент для SCSS/CSS: текстовый парсер + CSS-правила.
 * Подключается распространением в корневой массив конфигов:
 *   export default [ ..., ...frontend.configs.css ]
 */
export const css = [
    {
        name: "@selfreview/conventions/css",
        files: ["**/*.{scss,css}"],
        languageOptions: { parser: cssParser },
        plugins: { frontend: { rules } },
        rules: {
            "frontend/css-1": "error",
            "frontend/css-2": "warn",
            "frontend/css-3": "error",
            "frontend/css-4": "error",
            "frontend/css-5": "error",
            "frontend/css-6": "error",
            "frontend/css-7": "error",
        } as Record<string, "error" | "warn">,
    },
];

export const configs = { recommended, reviewMax, strict, css };
export { cssParser };
export type { DetectorState };
export default { rules, configs, cssParser };
