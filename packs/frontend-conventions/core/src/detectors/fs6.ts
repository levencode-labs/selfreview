import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

const VIEW_NOT_VIEWMODEL = /^(get|make)[A-Z][A-Za-z0-9]*View$/;

function topLevelNames(program: TSESTree.Program) {
    return program.body.flatMap(statement => {
        const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
        if (declaration?.type === "FunctionDeclaration") return declaration.id ? [declaration.id] : [];
        if (declaration?.type !== "VariableDeclaration") return [];
        return declaration.declarations.flatMap(node => node.id.type === "Identifier" ? [node.id] : []);
    });
}

/** FS-6 — view-селектор называется get<Что>ViewModel, не get<Что>View. */
export function detectFs6(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program || /(?:^|[\\/])(?:base|saga|validation|public|analytics)Selectors\.tsx?$/i.test(filePath)) return [];
    const findings: Finding[] = [];

    for (const id of topLevelNames(program)) {
        if (!VIEW_NOT_VIEWMODEL.test(id.name)) continue;
        findings.push(
            makeFinding(
                "FS-6",
                "MUST",
                `Селектор "${id.name}" — переименуй в "${id.name}Model": view-селектор компонента называется get<Что>ViewModel, не ...View (FS-6)`,
                filePath,
                nodeStartRange(id),
            ),
        );
    }

    return findings;
}
