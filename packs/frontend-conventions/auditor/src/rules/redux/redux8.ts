import { findCreateSliceReducersObjects, makeFinding } from "../../../../core/src/index.js";
import type { Rule } from "../../engine/types.js";
import { parseTs } from "../../engine/parseSource.js";

const SUFFIXED_KEY = /(Begin|Success|Error)$/;

/**
 * REDUX-8 (пустые редьюсеры-заглушки) — НЕ в дефолтном наборе (см. rules/index.ts и реестр).
 * Файл и тест сохранены для точечного включения через собственный rules-список.
 */
export const redux8: Rule = {
    id: "REDUX-8",
    severity: "SHOULD",
    title: "Пустые редьюсеры-заглушки не заводим",
    appliesTo: (path) => /\.ts$/.test(path) && /slice\.ts$/.test(path),
    usesAst: true,
    check(ctx) {
        const program = ctx.ast ?? parseTs(ctx.sourceText, ctx.file.path);
        if (!program) return [];

        const findings = [];
        for (const reducersObj of findCreateSliceReducersObjects(program)) {
            for (const prop of reducersObj.properties) {
                if (prop.type !== "Property" || prop.key.type !== "Identifier" || !SUFFIXED_KEY.test(prop.key.name)) continue;
                const value = prop.value;
                const fn = value.type === "ArrowFunctionExpression" || value.type === "FunctionExpression" ? value : null;
                if (!fn || fn.body.type !== "BlockStatement" || fn.body.body.length !== 0) continue;
                findings.push(
                    makeFinding(
                        "REDUX-8",
                        "SHOULD",
                        `Редьюсер "${prop.key.name}" — пустая заглушка. Если статус не нужен, просто не передавай колбэк в fetchData (REDUX-8)`,
                        ctx.file.path,
                        prop.loc?.start
                            ? { start: { line: prop.loc.start.line, column: prop.loc.start.column } }
                            : undefined,
                    ),
                );
            }
        }
        return findings;
    },
};
