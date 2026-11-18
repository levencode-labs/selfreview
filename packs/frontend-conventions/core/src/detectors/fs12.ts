import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { walk, isPascalCase } from "../ast/walk.js";
import { makeFinding, nodeStartRange } from "./helpers.js";

const MIN_ROUTES = 2;
const ROUTES_NAME_RE = /(RoutesGroup|Routes)$/;

function isRouteElement(node: TSESTree.JSXChild): boolean {
    if (node.type !== "JSXElement") return false;
    const name = node.openingElement.name;
    return name.type === "JSXIdentifier" && name.name === "Route";
}

function findRouteCluster(body: TSESTree.Node): TSESTree.JSXElement | null {
    let cluster: TSESTree.JSXElement | null = null;
    walk(body, (n) => {
        if (cluster || n.type !== "JSXElement") return;
        const routeChildren = n.children.filter(isRouteElement);
        if (routeChildren.length >= MIN_ROUTES) cluster = n;
    });
    return cluster;
}

/** FS-12 — несколько Route одного раздела — в <Раздел>RoutesGroup/Routes, не россыпью. */
export function detectFs12(program: TSESTree.Program | null, sourceText: string, filePath: string): Finding[] {
    if (!program) return [];
    const findings: Finding[] = [];

    function checkComponent(name: string | undefined, body: TSESTree.Node) {
        if (!name || !isPascalCase(name) || ROUTES_NAME_RE.test(name)) return;
        const cluster = findRouteCluster(body);
        if (!cluster) return;
        findings.push(
            makeFinding(
                "FS-12",
                "SHOULD",
                `Несколько <Route> одного раздела россыпью в "${name}" — вынеси роутинг в компонент/константу <Раздел>Routes (FS-12)`,
                filePath,
                nodeStartRange(cluster),
            ),
        );
    }

    walk(program, (n) => {
        if (n.type === "FunctionDeclaration" && n.id) checkComponent(n.id.name, n.body);
        if (n.type !== "VariableDeclarator" || n.id.type !== "Identifier" || !n.init) return;
        if (n.init.type === "ArrowFunctionExpression" || n.init.type === "FunctionExpression") {
            checkComponent(n.id.name, n.init.body);
        } else if (n.init.type === "JSXElement" || n.init.type === "JSXFragment") {
            checkComponent(n.id.name, n.init);
        }
    });

    return findings;
}
