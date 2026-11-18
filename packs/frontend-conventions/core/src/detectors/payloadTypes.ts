import { parse, type TSESTree } from "@typescript-eslint/typescript-estree";
import { posix } from "node:path";

type PayloadKind = "primitive" | "array";

/**
 * Conservative syntax-only resolution: relative named imports, local aliases and enums.
 * Unknown/object/generic types stay unresolved. Readers belong to the adapter so committed
 * reviews never mix a HEAD slice with types from a dirty worktree.
 */
export function payloadTypeResolver(
    program: TSESTree.Program,
    filePath: string,
    readSource?: (path: string) => string | undefined,
): (type: TSESTree.Node) => PayloadKind | null {
    const programs = new Map<string, TSESTree.Program | null>([[filePath.replace(/\\/g, "/"), program]]);

    function load(path: string): TSESTree.Program | null {
        if (programs.has(path)) return programs.get(path) ?? null;
        let ast: TSESTree.Program | null = null;
        try {
            const source = readSource?.(path);
            if (source !== undefined) ast = parse(source, { loc: true, range: true, jsx: path.endsWith(".tsx") });
        } catch {
            // Missing sources are not evidence that a payload is primitive.
        }
        programs.set(path, ast);
        return ast;
    }

    function resolve(type: TSESTree.Node, path: string, seen: Set<string>, depth: number): PayloadKind | null {
        if (depth > 12) return null;
        if (["TSStringKeyword", "TSNumberKeyword", "TSBooleanKeyword", "TSBigIntKeyword", "TSSymbolKeyword",
            "TSNullKeyword", "TSUndefinedKeyword"].includes(type.type)) return "primitive";
        if (type.type === "TSLiteralType") return "primitive";
        if (type.type === "TSArrayType" || type.type === "TSTupleType") return "array";
        if (type.type === "TSTypeOperator") return type.typeAnnotation ? resolve(type.typeAnnotation, path, seen, depth + 1) : null;
        if (type.type === "TSUnionType") {
            const kinds = type.types.map(member => resolve(member, path, seen, depth + 1));
            return kinds.every(kind => kind === "primitive") ? "primitive"
                : kinds.every(kind => kind === "array") ? "array" : null;
        }
        if (type.type !== "TSTypeReference" || type.typeName.type !== "Identifier") return null;
        const name = type.typeName.name;
        if (name === "Array" || name === "ReadonlyArray") return "array";
        const key = path + ":" + name;
        if (seen.has(key)) return null;
        const next = new Set(seen).add(key);
        const ast = load(path);
        if (!ast) return null;

        for (const statement of ast.body) {
            const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
            if (declaration?.type === "TSEnumDeclaration" && declaration.id.name === name) return "primitive";
            if (declaration?.type === "TSTypeAliasDeclaration" && declaration.id.name === name) {
                if (declaration.typeParameters) return null;
                return resolve(declaration.typeAnnotation, path, next, depth + 1);
            }
        }

        for (const statement of ast.body) {
            if (statement.type !== "ImportDeclaration" || typeof statement.source.value !== "string"
                || !statement.source.value.startsWith(".")) continue;
            const specifier = statement.specifiers.find(spec => spec.type === "ImportSpecifier" && spec.local.name === name);
            if (specifier?.type !== "ImportSpecifier") continue;
            const imported = specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;
            const base = posix.normalize(posix.join(posix.dirname(path), statement.source.value));
            const candidates = /\.tsx?$/.test(base) ? [base] : [base + ".ts", base + ".tsx", base + "/index.ts"];
            for (const candidate of candidates) {
                if (!load(candidate)) continue;
                return resolve({ ...type, typeName: { ...type.typeName, name: imported } }, candidate, next, depth + 1);
            }
        }
        return null;
    }

    return type => resolve(type, filePath.replace(/\\/g, "/"), new Set(), 0);
}
