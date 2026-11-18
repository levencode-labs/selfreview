import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { walk, basename, dirname, stripExt, isCamelCase, isPascalCase, componentBody } from "../ast/walk.js";

const EXEMPT_BASENAMES = new Set(["index", "types", "constants", "helpers", "factories", "sagas", "slice", "reducer", "Container"]);

/**
 * "Большая буква — когда имя = обозначение конкретной сущности, используемой в коде" (вики).
 * Не только класс: компонент/функция, экспортируемая под тем же именем, что и файл.
 */
function hasMatchingNamedEntity(program: TSESTree.Program, name: string): boolean {
    let found = false;
    walk(program, (n) => {
        if (found) return;
        if (n.type === "ClassDeclaration" && n.id?.name === name) found = true;
        if (n.type === "FunctionDeclaration" && n.id?.name === name) found = true;
        if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.id.name === name && n.init && (componentBody(n.init) !== null || n.init.type === "ClassExpression")) {
            found = true;
        }
    });
    return found;
}

/**
 * FS-5: файлы/папки — camelCase, кроме конкретных именованных сущностей (класс, компонент).
 * Только для нового/переименованного файла (по legacy-коду не шумим).
 */
export function detectFs5(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!state.isNew) return [];

    const rawName = stripExt(basename(filePath));
    if (EXEMPT_BASENAMES.has(rawName)) return [];

    const parentDir = basename(dirname(filePath));

    // Корневой файл компонента: MyComponent/MyComponent.tsx — обязан быть PascalCase,
    // это самостоятельная сущность, проверяется в структурных правилах, не здесь.
    if (rawName === parentDir) {
        if (!isPascalCase(rawName)) {
            return [
                makeFinding(
                    "FS-5",
                    "MUST",
                    `Папка компонента "${parentDir}" должна быть с большой буквы (FS-5)`,
                    filePath,
                    { start: { line: 1, column: 0 } },
                ),
            ];
        }
        return [];
    }

    if (isCamelCase(rawName)) return [];
    if (!isPascalCase(rawName)) return []; // snake_case и т.п. — не наш кейс

    if (program && hasMatchingNamedEntity(program, rawName)) return [];

    return [
        makeFinding(
            "FS-5",
            "MUST",
            `Файл "${basename(filePath)}" — с большой буквы, а не класс-сущность. Файлы/папки — camelCase, кроме конкретных именованных сущностей (класс, компонент) (FS-5)`,
            filePath,
            { start: { line: 1, column: 0 } },
        ),
    ];
}
