import { inProfileDirectory, profile } from "../profile.js";
import type { TSESTree as T } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { basename, dirname, stripExt, walk } from "../ast/walk.js";
import { makeFinding, type DetectorState } from "./helpers.js";
import { isFunction, renderAnalysis, unwrap, usageRange } from "./renderAnalysis.js";

const ts = (path: string) => /\.tsx?$/.test(path) && !path.endsWith(".d.ts")
    && !/(^|\/)(server|node_modules|dist)\//.test(path);
const tsx = (path: string) => ts(path) && path.endsWith(".tsx");
const targetApp = (path: string) => ts(path) && inProfileDirectory(path, profile.targetApp);

export const corpusRulePaths = {
    "CSS-8": tsx,
    "CSS-9": tsx,
    "REACT-18": tsx,
    "REACT-19": tsx,
    "REDUX-10": ts,
    "REDUX-11": ts,
    "MISC-19": ts,
    "RUI-5": (path: string) => targetApp(path) && tsx(path),
    "FS-16": (path: string) => targetApp(path) && path.includes("/components/") && !path.includes("/hooks/"),
};

function jsxExpression(node: T.Node) {
    if (node.type === "JSXAttribute" && node.name.type === "JSXIdentifier"
        && node.value?.type === "JSXExpressionContainer" && node.value.expression.type !== "JSXEmptyExpression") {
        return { name: node.name.name, expression: unwrap(node.value.expression) };
    }
    return undefined;
}

export function detectCss8(program: T.Program | null, _text: string, file: string, state: DetectorState = {}): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];
    const analysis = renderAnalysis(program);
    walk(program, node => {
        const prop = jsxExpression(node);
        if (prop?.name !== "style" || analysis.constValue(prop.expression).type !== "ObjectExpression") return;
        findings.push(makeFinding("CSS-8", "MUST", "Задай стили JSX через класс CSS-модуля (CSS-8)", file, usageRange(node, state)));
    });
    return findings;
}

export function detectCss9(program: T.Program | null, _text: string, file: string, state: DetectorState = {}): Finding[] {
    const path = file.replace(/\\/g, "/");
    const component = stripExt(basename(path));
    if (!program || !/^[A-Z]/.test(component) || component !== basename(dirname(path))) return [];
    return program.body.flatMap(node => {
        if (node.type !== "ImportDeclaration") return [];
        const module = /^\.\/([^/]+)\.module\.(css|scss)$/.exec(String(node.source.value));
        if (!module || module[1] === component) return [];
        const name = "./" + component + ".module." + module[2];
        return [makeFinding("CSS-9", "MUST", "Используй имя модуля " + name + " (CSS-9)", file, usageRange(node, state))];
    });
}

export function detectReact18(program: T.Program | null, _text: string, file: string, state: DetectorState = {}): Finding[] {
    if (!program) return [];
    const analysis = renderAnalysis(program);
    const findings: Finding[] = [];
    for (const { fn } of analysis.components) {
        const calls = analysis.calls(fn).filter(call => {
            const binding = analysis.imported(call.callee, call);
            return binding?.name === "useActions" && binding.source === profile.appUi + "/hooks";
        });
        if (calls.length !== 1) continue;
        const declaration = analysis.parents.get(calls[0]);
        if (declaration?.type !== "VariableDeclarator" || declaration.id.type !== "Identifier" || declaration.id.name === "bindedActions") continue;
        findings.push(makeFinding("REACT-18", "SHOULD", 'Назови набор экшенов "bindedActions" (REACT-18)', file, usageRange(declaration, state)));
    }
    return findings;
}

export function detectReact19(program: T.Program | null, _text: string, file: string, state: DetectorState = {}): Finding[] {
    if (!program) return [];
    const analysis = renderAnalysis(program);
    const findings: Finding[] = [];
    walk(program, node => {
        const prop = jsxExpression(node);
        if (!prop || !/^on[A-Z]/.test(prop.name) || prop.expression.type !== "CallExpression") return;
        const name = prop.expression.callee;
        if (name.type !== "Identifier" || name.name.endsWith("HandleCreator")) return;
        const binding = analysis.localBinding(name.name, prop.expression);
        if (!binding) return;
        const factory = binding.type === "FunctionDeclaration" ? binding : analysis.constValue(name);
        if (!isFunction(factory)) return;
        const body = factory.body;
        const returns = body.type === "BlockStatement"
            ? body.body.flatMap(statement => statement.type === "ReturnStatement" ? [statement.argument] : [])
            : [body];
        if (!returns.length || !returns.every(returned => returned && isFunction(analysis.constValue(returned)))) return;
        const usage = usageRange(node, state);
        const declaration = usageRange(binding, state);
        const range = state.addedLines?.has(declaration.start.line) ? declaration : usage;
        if (findings.some(f => f.line === range.start.line && f.loc?.start.column === range.start.column)) return;
        findings.push(makeFinding("REACT-19", "MUST", "Имя фабрики обработчика должно оканчиваться на HandleCreator (REACT-19)", file, range));
    });
    return findings;
}

export function detectRedux10(program: T.Program | null, _text: string, file: string, state: DetectorState = {}): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];
    const parents = new Map<T.Node, T.Node | null>();
    walk(program, (node, parent) => parents.set(node, parent));
    walk(program, (node, parent) => {
        if (node.type !== "YieldExpression") return;
        for (let current: T.Node | null = parent, child: T.Node = node; current; child = current, current = parents.get(current) ?? null) {
            if (isFunction(current)) break;
            if ((current.type === "IfStatement" || current.type === "ConditionalExpression" || current.type === "WhileStatement"
                || current.type === "DoWhileStatement" || current.type === "ForStatement") && current.test === child) {
                findings.push(makeFinding("REDUX-10", "MUST", "Сохрани результат yield до проверки условия (REDUX-10)", file, usageRange(node, state)));
                break;
            }
        }
    });
    return findings;
}

const reduxTypes = new Set(["Action", "UnknownAction", "Reducer", "PayloadAction", "ActionCreatorWithPayload"]);

export function detectRedux11(program: T.Program | null, _text: string, file: string, state: DetectorState = {}): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];
    const namespaces = new Set<string>();
    function report(name: string, node: T.Node) {
        if (reduxTypes.has(name)) findings.push(makeFinding("REDUX-11", "MUST", "Импортируй " + name + " из @reduxjs/toolkit (REDUX-11)", file, usageRange(node, state)));
    }
    for (const node of program.body) {
        if (node.type !== "ImportDeclaration" || node.source.value !== "redux") continue;
        for (const spec of node.specifiers) {
            if (spec.type === "ImportNamespaceSpecifier") namespaces.add(spec.local.name);
            if (spec.type === "ImportSpecifier") report(spec.imported.type === "Identifier" ? spec.imported.name : spec.imported.value, spec);
        }
    }
    if (namespaces.size) walk(program, node => {
        if (node.type === "TSQualifiedName" && node.left.type === "Identifier" && namespaces.has(node.left.name)) report(node.right.name, node);
    });
    return findings;
}

export function detectMisc19(program: T.Program | null, _text: string, file: string, state: DetectorState = {}): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];
    walk(program, node => {
        if (node.type !== "IfStatement") return;
        if (node.consequent.type !== "BlockStatement") {
            findings.push(makeFinding("MISC-19", "MUST", "Добавь фигурные скобки у тела if (MISC-19)", file, usageRange(node.consequent, state)));
        }
        if (node.alternate && node.alternate.type !== "BlockStatement" && node.alternate.type !== "IfStatement") {
            findings.push(makeFinding("MISC-19", "MUST", "Добавь фигурные скобки у тела else (MISC-19)", file, usageRange(node.alternate, state)));
        }
    });
    return findings;
}

export function detectRui5(program: T.Program | null, _text: string, file: string, state: DetectorState = {}): Finding[] {
    if (!program) return [];
    const sources = (source: string) => source === profile.reactUi || source === profile.reactUi + "/components/Gapped";
    const findings: Finding[] = [];
    const analysis = renderAnalysis(program);
    const report = (node: T.Node) => findings.push(makeFinding("RUI-5", "SHOULD", "Для раскладки целевого воркспейса используй CSS gap вместо Gapped (RUI-5)", file, usageRange(node, state)));
    walk(program, node => {
        if (node.type === "ImportSpecifier" && node.imported.type === "Identifier" && node.imported.name === "Gapped") {
            const declaration = analysis.parents.get(node);
            if (declaration?.type === "ImportDeclaration" && sources(String(declaration.source.value))) report(node);
        }
        if (node.type !== "JSXOpeningElement" && node.type !== "MemberExpression") return;
        const reference = node.type === "JSXOpeningElement" ? node.name : node;
        if (reference.type !== "JSXMemberExpression" && reference.type !== "MemberExpression") return;
        const binding = analysis.imported(reference);
        if (binding?.name === "Gapped" && sources(binding.source)) report(reference);
    });
    return findings;
}

export function detectFs16(program: T.Program | null, _text: string, file: string, state: DetectorState = {}): Finding[] {
    const name = stripExt(basename(file.replace(/\\/g, "/")));
    if (!program || !/^use[A-Z]/.test(name) || !state.isNew) return [];
    const analysis = renderAnalysis(program);
    function declaresHook(binding: T.Node | undefined): boolean {
        if (binding?.type === "FunctionDeclaration") return binding.id?.name === name;
        if (binding?.type === "VariableDeclaration") return binding.declarations.some(declaresHook);
        return binding?.type === "VariableDeclarator" && binding.id.type === "Identifier"
            && binding.id.name === name && !!binding.init && isFunction(analysis.constValue(binding.init));
    }
    const exported = program.body.find(node => {
        if (node.type === "ExportDefaultDeclaration") {
            const d = node.declaration;
            return declaresHook(d.type === "Identifier" && d.name === name ? analysis.localBinding(name, d) : d);
        }
        if (node.type !== "ExportNamedDeclaration" || node.source) return false;
        if (node.declaration) return declaresHook(node.declaration);
        return node.specifiers.some(spec => spec.exportKind !== "type" && spec.local.name === name && declaresHook(analysis.localBinding(name, spec.local)));
    });
    return exported ? [makeFinding("FS-16", "SHOULD", "Помести отдельный хук в hooks компонента или shared/hooks (FS-16)", file, usageRange(exported, state))] : [];
}
