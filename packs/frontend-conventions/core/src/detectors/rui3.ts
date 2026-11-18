import { inProfileDirectory, profile } from "../profile.js";
import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";
import { walk } from "../ast/walk.js";

/**
 * RUI-3: инлайн-<svg> в JSX не используем — есть готовые гранулярные иконки из @example/icons
 * (см. RUI-1). Сложные паттерны/надписи на svg рисуем отдельным компонентом-иконкой в icons/.
 * Исключаем shared/ и legacy-ui/ — там легальное переиспользуемое инлайн-svg.
 * Severity — MUST.
 */
export function detectRui3(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    _state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!program || !/\.tsx$/.test(filePath)) return [];
    if (inProfileDirectory(filePath, "shared") || inProfileDirectory(filePath, profile.sharedUiDirectory)) return [];

    const findings: Finding[] = [];
    walk(program, (n) => {
        if (n.type !== "JSXElement") return;
        const name = n.openingElement.name;
        if (name.type !== "JSXIdentifier" || name.name !== "svg") return;
        if (!n.openingElement.loc) return;

        findings.push(
            makeFinding(
                "RUI-3",
                "MUST",
                `Инлайн-<svg> в компоненте — используй готовую иконку из ${profile.icons} (или вынеси в компонент-иконку) (RUI-3)`,
                filePath,
                { start: { line: n.openingElement.loc.start.line, column: n.openingElement.loc.start.column } },
            ),
        );
    });

    return findings;
}
