import type { TSESTree } from "@typescript-eslint/typescript-estree";
import { makeFinding, walk } from "../../../core/src/index.js";
import type { FileDiff, Finding } from "./types.js";

export const duplicateCodeId = "DUPLICATE-CODE";

const minimumNodes = 30;
const excludedPath = /(^|\/)(?:node_modules|dist|server|generated|__generated__|test|tests|__tests__|fixtures|__fixtures__)\/|\.(?:test|spec|generated)\.tsx?$/;
const metadataKeys = new Set(["loc", "range", "parent"]);

export function supportsDuplicateCheck(path: string): boolean {
    return !excludedPath.test(path);
}

interface Occurrence {
    file: string;
    line: number;
    column: number;
    changed: boolean;
}

function containsChangedLine(file: FileDiff, body: TSESTree.BlockStatement): boolean {
    if (file.isWhitespaceOnly) return false;
    for (let line = body.loc.start.line; line <= body.loc.end.line; line++) {
        if (file.addedLines.has(line)) return true;
    }
    return false;
}

export class DuplicateFunctionIndex {
    private readonly groups = new Map<string, Occurrence[]>();

    add(file: FileDiff, program: TSESTree.Program): void {
        walk(program, (node, parent) => {
            const isNamedFunction = node.type === "FunctionDeclaration"
                || ((node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression")
                    && (parent?.type === "VariableDeclarator" || parent?.type === "Property" || parent?.type === "MethodDefinition"));
            if (!isNamedFunction || node.body?.type !== "BlockStatement" || node.body.body.length < 2) return;

            let nodeCount = 0;
            const fingerprint = JSON.stringify([node.async, node.generator, node.params, node.body], function (this: { type?: string }, key, value) {
                if (metadataKeys.has(key) || (key === "raw" && this.type === "Literal")) return undefined;
                if (typeof value === "bigint") return { bigint: value.toString() };
                if (value && typeof value.type === "string") nodeCount++;
                return value;
            });
            if (nodeCount < minimumNodes) return;

            const { line, column } = node.body.loc.start;
            const occurrence = { file: file.path, line, column, changed: containsChangedLine(file, node.body) };
            const peers = this.groups.get(fingerprint);
            if (peers) {
                peers.push(occurrence);
            } else {
                this.groups.set(fingerprint, [occurrence]);
            }
        });
    }

    findings(): Finding[] {
        const findings: Finding[] = [];
        for (const group of this.groups.values()) {
            if (group.length < 2) continue;
            const changed = group.find((occurrence) => occurrence.changed);
            if (!changed) continue;

            const peers = group.filter((occurrence) => occurrence !== changed);
            const locations = peers.slice(0, 5).map(({ file, line }) => file + ":" + line).join(", ");
            const remaining = peers.length > 5 ? " (ещё " + (peers.length - 5) + ")" : "";
            findings.push(makeFinding(duplicateCodeId, "info",
                "Совпадающая реализация: " + locations + remaining + ". Проверь общую ответственность перед выделением общего кода.",
                changed.file, { start: { line: changed.line, column: changed.column } }));
        }
        return findings;
    }
}
