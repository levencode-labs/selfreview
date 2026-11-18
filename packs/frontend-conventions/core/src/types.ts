export type Severity = "BLOCK" | "MUST" | "SHOULD" | "info";

/** Позиция в духе ESTree/AST: line — 1-based, column — 0-based. */
export interface SourcePosition {
    line: number;
    column: number;
}

export interface SourceRange {
    start: SourcePosition;
    end?: SourcePosition;
}

export interface FixSpec {
    /** символьные offsets [start, end) в исходнике */
    range: [number, number];
    /** текст замены */
    text: string;
}

export interface SuggestionSpec {
    desc: string;
    fix: FixSpec;
}

/**
 * Нормализованная находка, общая для CLI/auditor, ESLint-плагина и Desktop.
 *
 * Аудитор использует `file`/`line`/`column` (совместимо со старым ast-tool).
 * ESLint использует `loc`/`range`/`fix`/`suggestions`.
 */
export interface Finding {
    ruleId: string;
    severity: Severity;
    message: string;

    /** путь относительно корня репозитория (для auditor) — может отсутствовать у file-less находок */
    file?: string;

    /** 1-based строка (legacy аудитор) */
    line?: number;
    /** 1-based колонка (legacy аудитор, по желанию правила) */
    column?: number;

    /** точная позиция; column — 0-based (ESTree) */
    loc?: SourceRange;

    /** символьный диапазон [start, end) — для fixes */
    range?: [number, number];

    /** безопасный автофикс (не меняет runtime-семантику) */
    fix?: FixSpec;

    /** предложения правки, когда направление известно, но auto-rewrite рискованно */
    suggestions?: SuggestionSpec[];
}

export type RuleScope = "ast" | "diff" | "file" | "project" | "git" | "css";

/** Токен SCSS/CSS-класса, найденный построчным сканером (для CSS-1/3). */
export interface ScssClassToken {
    className: string;
    line: number;
    /** найден внутри :global(...) — явный сигнал "глобальный класс" (CSS-модули) */
    isGlobalWrap: boolean;
}
export type RuleSourceKind = "wiki" | "mr-pattern";

export interface RuleMetadata {
    id: string;
    title: string;
    severity: Severity;

    source: RuleSourceKind;
    /** категория договорённости, например "TypeScript", "React", "Файловая структура" */
    category: string;

    scope: RuleScope;

    eslint: {
        supported: boolean;
        /** почему невозможно/нецелесообразно как правило ESLint текущего файла */
        reason?: string;
    };

    fixKind: "none" | "suggestion" | "safe-fix";

    docs?: {
        description?: string;
        sourceReference?: string;
    };

    /** активное правило включено в дефолтный набор auditor'а (REDUX-8 = false) */
    active: boolean;
}

export type { TSESTree } from "@typescript-eslint/typescript-estree";
