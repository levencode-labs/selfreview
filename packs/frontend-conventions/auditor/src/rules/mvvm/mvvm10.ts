import { detectMvvm10CreateSelector } from "../../../../core/src/index.js";
import type { Rule } from "../../engine/types.js";
import { parseTs } from "../../engine/parseSource.js";
import { basename, stripExt } from "../utils.js";

const RECOGNIZED_SELECTOR_FILES = new Set(["baseSelectors", "viewSelectors", "validationSelectors", "sagasSelectors", "sagaSelectors", "analyticsSelectors", "publicSelectors", "index"]);

export const mvvm10: Rule = {
    id: "MVVM-10",
    severity: "SHOULD",
    title: "Селекторы — в папке selectors/, с распознаваемым именем файла",
    fileLevel: true,
    appliesTo: (path) => /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts") && !/\.test\.tsx?$/.test(path),
    usesAst: true,
    check(ctx) {
        const isInSelectorsDir = ctx.file.path.includes("/selectors/");

        if (!isInSelectorsDir) {
            const program = ctx.ast ?? parseTs(ctx.sourceText, ctx.file.path);
            if (!program) return [];
            // createSelector вне selectors/ — для модифицированного файла гейтим по added lines
            const findings = [];
            for (const f of detectMvvm10CreateSelector(program, ctx.sourceText, ctx.file.path)) {
                if (!ctx.file.addedLines.has(f.line ?? 0)) continue;
                findings.push(f);
            }
            return findings;
        }

        if (ctx.file.status !== "added") return [];
        const name = stripExt(basename(ctx.file.path));
        if (RECOGNIZED_SELECTOR_FILES.has(name)) return [];

        return [
            {
                ruleId: "MVVM-10",
                severity: "SHOULD",
                message: `Файл "${basename(ctx.file.path)}" в selectors/ — нестандартное имя. Ожидались baseSelectors/viewSelectors/validationSelectors/sagasSelectors/analyticsSelectors/publicSelectors (MVVM-10)`,
                file: ctx.file.path,
                line: 1,
            },
        ];
    },
};
