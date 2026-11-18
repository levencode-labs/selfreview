/**
 * Passthrough-парсер для ESLint над .scss/.css — позволяет правилам (CSS-1..5)
 * работать с текстом файла, не парся его как JavaScript. Возвращает «пустой» Program,
 * покрывающий весь файл; детекторы CSS читают sourceText напрямую (построчные сканеры).
 *
 * Формат — объект с parse()/parseForESLint(), как требует ESLint flat config.
 */
export interface FakeProgram {
    type: "Program";
    body: unknown[];
    comments: unknown[];
    tokens: unknown[];
    range: [number, number];
    loc: { start: { line: number; column: number }; end: { line: number; column: number } };
    sourceType: "module";
}

function endLoc(code: string): { line: number; column: number } {
    const lines = code.split("\n");
    return { line: lines.length, column: lines[lines.length - 1]?.length ?? 0 };
}

function parseCss(code: string): FakeProgram {
    return {
        type: "Program",
        body: [],
        comments: [],
        tokens: [],
        range: [0, code.length],
        loc: { start: { line: 1, column: 0 }, end: endLoc(code) },
        sourceType: "module",
    };
}

export const cssParser = {
    parse: (code: string) => parseCss(code),
    parseForESLint: (code: string) => ({ ast: parseCss(code) }),
};
