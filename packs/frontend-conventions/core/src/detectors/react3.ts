import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk, isPascalCase } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

function isFragmentJsx(node: TSESTree.Node): boolean {
    if (node.type === "JSXFragment") return true;
    if (node.type !== "JSXElement") return false;
    const name = node.openingElement.name;
    if (name.type === "JSXIdentifier") return name.name === "Fragment";
    if (name.type === "JSXMemberExpression" && name.property.type === "JSXIdentifier") {
        return name.property.name === "Fragment";
    }
    return false;
}

function findReturnedJsxRoots(body: TSESTree.Node): TSESTree.Node[] {
    const roots: TSESTree.Node[] = [];
    if (body.type === "JSXElement" || body.type === "JSXFragment") {
        roots.push(body);
        return roots;
    }
    walk(body, (n) => {
        if (n.type === "ReturnStatement" && n.argument && (n.argument.type === "JSXElement" || n.argument.type === "JSXFragment")) {
            roots.push(n.argument);
        }
    });
    return roots;
}

/** REACT-3 — Fragment как корневой элемент компонента — нарушение (ломает флекс-контейнер). */
export function detectReact3(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    function checkFn(name: string | undefined, fnBody: TSESTree.Node) {
        if (!name || !isPascalCase(name)) return;
        for (const root of findReturnedJsxRoots(fnBody)) {
            if (!isFragmentJsx(root)) continue;
            findings.push(
                makeFinding(
                    "REACT-3",
                    "SHOULD",
                    `Компонент "${name}" возвращает Fragment как корневой элемент — не используем Fragment на верхнем уровне (ломает флекс-контейнер) (REACT-3)`,
                    filePath,
                    nodeStartRange(root),
                ),
            );
        }
    }

    walk(program, (n) => {
        if (n.type === "FunctionDeclaration" && n.id) checkFn(n.id.name, n.body);
        if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.init && (n.init.type === "ArrowFunctionExpression" || n.init.type === "FunctionExpression")) {
            checkFn(n.id.name, n.init.body);
        }
    });

    return findings;
}
