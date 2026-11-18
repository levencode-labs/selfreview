import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk } from "../ast/walk.js";
import { makeFinding, nodeStartRange, type DetectorState } from "./helpers.js";
import { payloadTypeResolver } from "./payloadTypes.js";

/** Имя редьюсера, внутри которого встретился PayloadAction — для внятного текста замечания. */
function collectReducerNames(program: TSESTree.Program): Map<number, string> {
    const byLine = new Map<number, string>();

    walk(program, (n) => {
        if (n.type !== "Property" || n.key.type !== "Identifier") return;
        if (n.value.type !== "FunctionExpression" && n.value.type !== "ArrowFunctionExpression") return;

        const name = n.key.name;
        walk(n.value, (inner) => {
            if (inner.type === "TSTypeReference" && inner.typeName.type === "Identifier" && inner.typeName.name === "PayloadAction") {
                byLine.set(inner.loc.start.line, name);
            }
        });
    });

    return byLine;
}

/** REDUX-5 — payload экшена должен быть объектом (исключение — данные с бэка в *Success/Error). */
export function detectRedux5(program: TSESTree.Program | null, sourceText: string, filePath: string, state: DetectorState = {}): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];
    const reducerNameByLine = collectReducerNames(program);
    const resolveType = payloadTypeResolver(program, filePath, state.readSource);

    walk(program, (n) => {
        if (
            n.type === "TSTypeReference" &&
            n.typeName.type === "Identifier" &&
            n.typeName.name === "PayloadAction" &&
            n.typeArguments?.params.length === 1
        ) {
            const arg = n.typeArguments.params[0];
            const kind = resolveType(arg);
            if (!kind) return;
            const isArray = kind === "array";

            const reducerName = reducerNameByLine.get(n.loc.start.line) ?? null;
            const isServerSuccess = /(Success|Error)$/.test(reducerName ?? "");
            if (isServerSuccess) return;

            findings.push(
                makeFinding(
                    "REDUX-5",
                    "MUST",
                    `payload экшена${reducerName ? ` "${reducerName}"` : ""} — ${isArray ? "массив" : "примитив"}, а не объект. Оберни в объект: PayloadAction<{ items: T[] }> (исключение — данные с бэка в *Success) (REDUX-5)`,
                    filePath,
                    nodeStartRange(n),
                ),
            );
        }

        if (n.type !== "Property" || n.key.type !== "Identifier" || n.key.name !== "payload") return;
        if (n.value.type !== "Literal") return;
        findings.push(
            makeFinding(
                "REDUX-5",
                "MUST",
                `payload — примитив, а не объект. Payload экшена должен быть объектом (исключение — примитив от бэка в onSuccess) (REDUX-5)`,
                filePath,
                nodeStartRange(n.value),
            ),
        );
    });

    return findings;
}
