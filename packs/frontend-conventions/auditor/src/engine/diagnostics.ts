export type InternalDiagnosticCode = "RULE_EXECUTION_FAILED" | "PARSE_FAILED" | "SOURCE_READ_FAILED";

export interface InternalDiagnostic {
    code: InternalDiagnosticCode;
    file: string;
    ruleId?: string;
    message: string;
}

export function describeDiagnostic(d: InternalDiagnostic): string {
    const where = d.ruleId ? `${d.file} [${d.ruleId}]` : d.file;
    switch (d.code) {
        case "RULE_EXECUTION_FAILED":
            return `Правило упало на файле ${where}: ${d.message}`;
        case "PARSE_FAILED":
            return `Файл не удалось распарсить (${d.file}): ${d.message}`;
        case "SOURCE_READ_FAILED":
            return `Не удалось прочитать содержимое ${d.file}: ${d.message}`;
    }
}
