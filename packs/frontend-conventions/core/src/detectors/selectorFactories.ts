import { parse, type TSESTree as T } from "@typescript-eslint/typescript-estree";
import { posix } from "node:path";
import { renderAnalysis, unwrap, isFunction } from "./renderAnalysis.js";

/** Bounded declaration evidence, not a name/prefix heuristic. Missing sources remain unknown. */
export function selectorFactoryResolver(program: T.Program, file: string, readSource?: (path: string) => string | undefined) {
    file = file.replace(/\\/g, "/");
    const programs = new Map<string, T.Program | null | undefined>([[file, program]]);
    function load(p: string) {
        if (programs.has(p)) return programs.get(p);
        let ast: T.Program | null | undefined;
        let source: string | undefined;
        try { source = readSource?.(p); } catch { /* unavailable related snapshot path */ }
        if (source !== undefined) {
            try { ast = parse(source, { loc: true, range: true, jsx: p.endsWith(".tsx") }); }
            catch { ast = null; } // A malformed candidate is present but cannot prove a factory.
        }
        programs.set(p, ast);
        return ast;
    }
    function resolveModule(specifier: string, from: string) {
        if (!specifier.startsWith(".")) return;
        const base = posix.normalize(posix.join(posix.dirname(from), specifier));
        if (base.startsWith("../")) return;
        const candidates = /\.tsx?$/.test(base) ? [base] : [base + ".ts", base + ".tsx", base + "/index.ts", base + "/index.tsx"];
        return candidates.find(candidate => load(candidate) !== undefined);
    }
    function resolve(name: string, p: string, seen: Set<string>, depth: number, exported = false): boolean | undefined {
        const key = JSON.stringify([p, name, exported]);
        if (depth > 6 || seen.has(key)) return;
        const next = new Set(seen).add(key);
        const ast = load(p);
        if (!ast) return;
        for (const s of ast.body) {
            if (exported && s.type !== "ExportNamedDeclaration") continue;
            const d = s.type === "ExportNamedDeclaration" ? s.declaration : s;
            let value: T.Node | null = null;
            if (d?.type === "FunctionDeclaration" && d.id?.name === name) value = d;
            if (d?.type === "VariableDeclaration") value = d.declarations.find(v => v.id.type === "Identifier" && v.id.name === name)?.init ?? null;
            if (!value) continue;
            value = unwrap(value);
            if (value.type === "Identifier") return resolve(value.name, p, next, depth + 1);
            if (!isFunction(value)) return false;
            const returned = value.body.type === "BlockStatement"
                ? (value.body.body.length === 1 && value.body.body[0].type === "ReturnStatement" ? value.body.body[0].argument : null)
                : value.body;
            if (!returned) return;
            const expression = unwrap(returned);
            if (expression.type !== "CallExpression") return false;
            const analysis = renderAnalysis(ast);
            const info = analysis.imported(expression.callee, expression);
            return info?.name === "createSelector" && ["reselect", "@reduxjs/toolkit"].includes(info.source) ? true : undefined;
        }
        if (exported) {
            for (const s of ast.body) {
                if (s.type !== "ExportNamedDeclaration" || s.exportKind === "type") continue;
                const spec = s.specifiers.find(v => v.exportKind !== "type" && (v.exported.type === "Identifier" ? v.exported.name : v.exported.value) === name);
                if (!spec) continue;
                const local = spec.local.type === "Identifier" ? spec.local.name : spec.local.value;
                if (!s.source) return resolve(local, p, next, depth + 1);
                const module = resolveModule(String(s.source.value), p);
                return module ? resolve(local, module, next, depth + 1, true) : undefined;
            }
            // shortcut: ambiguous export-all chains stay unknown until resolution accounts for every exporter.
            const star = ast.body.filter(s => s.type === "ExportAllDeclaration" && !s.exported && s.exportKind !== "type");
            if (star.length === 1 && star[0].type === "ExportAllDeclaration") {
                const module = resolveModule(String(star[0].source.value), p);
                if (module) return resolve(name, module, next, depth + 1, true);
            }
            return;
        }
        for (const s of ast.body) {
            if (s.type !== "ImportDeclaration" || s.importKind === "type") continue;
            const spec = s.specifiers.find(v => v.type === "ImportSpecifier" && v.importKind !== "type" && v.local.name === name);
            if (spec?.type !== "ImportSpecifier") continue;
            const original = spec.imported.type === "Identifier" ? spec.imported.name : spec.imported.value;
            const module = resolveModule(String(s.source.value), p);
            if (module) return resolve(original, module, next, depth + 1, true);
        }
        return;
    }
    return (name: string) => resolve(name, file, new Set(), 0);
}
