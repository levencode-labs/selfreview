import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding, nodeStartRange } from "./helpers.js";
import { isFunction, unwrap, type RenderFunction } from "./renderAnalysis.js";

function rootSelectors(program: TSESTree.Program) {
    return program.body.flatMap<RenderFunction>(statement => {
        const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
        if (declaration?.type === "FunctionDeclaration") return declaration.id?.name === "getRoot" ? [declaration] : [];
        if (declaration?.type !== "VariableDeclaration") return [];
        return declaration.declarations.flatMap(node => {
            if (node.id.type !== "Identifier" || node.id.name !== "getRoot" || !node.init) return [];
            const value = unwrap(node.init);
            return isFunction(value) ? [value] : [];
        });
    });
}

/** REDUX-2 — getRoot типизирован через With*, без any. */
export function detectRedux2(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    for (const selector of rootSelectors(program)) {
        const param = selector.params[0];
        const type = param?.type === "Identifier" ? param.typeAnnotation?.typeAnnotation : undefined;
        const broadRoot = /(?:^|[\\/])baseSelectors\.ts$/i.test(filePath) && type?.type === "TSTypeReference"
            && type.typeName.type === "Identifier" && ["RootState", "GlobalState"].includes(type.typeName.name);
        if (type && type.type !== "TSAnyKeyword" && !broadRoot) continue;
        findings.push(
            makeFinding(
                "REDUX-2",
                "MUST",
                `getRoot без локального типа состояния модуля — заведи With* и типизируй: (state: WithMyModule) => state.myModule (REDUX-2)`,
                filePath,
                nodeStartRange(selector),
            ),
        );
    }

    return findings;
}
