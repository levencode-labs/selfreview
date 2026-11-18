import type { Finding, Rule } from "../../engine/types.js";
import { makeFinding } from "../utils.js";

const MIN_SAMPLES = 8;
const INVALID_INDENT_SHARE_THRESHOLD = 0.6;

export const misc14: Rule = {
    id: "MISC-14",
    severity: "MUST",
    title: "Индентация нового кода — 4 пробела (.editorconfig)",
    fileLevel: true,
    appliesTo: (path) => /\.(ts|tsx)$/.test(path),
    check(ctx) {
        const lines = ctx.sourceText.split("\n");
        let countInvalid = 0;
        let count4 = 0;
        let firstOffenderLine: number | null = null;

        for (const lineNo of [...ctx.file.addedLines].sort((a, b) => a - b)) {
            const line = lines[lineNo - 1];
            if (line === undefined) continue;
            const indent = line.match(/^([ \t]+)\S/)?.[1];
            if (!indent) continue;
            if (indent.includes("\t") || indent.length % 4 === 2) {
                countInvalid++;
                if (firstOffenderLine === null) firstOffenderLine = lineNo;
            } else if (indent.length % 4 === 0) {
                count4++;
            }
        }

        const total = countInvalid + count4;
        if (total < MIN_SAMPLES) return [];
        if (countInvalid / total < INVALID_INDENT_SHARE_THRESHOLD) return [];

        return [
            makeFinding(
                "MISC-14",
                "MUST",
                `Похоже, новый код написан с табами или отступами в 2 пробела вместо 4 (корневой .editorconfig, а не дефолт Prettier). Настрой IDE и переотступи диф до сдачи (MISC-14)`,
                ctx,
                firstOffenderLine ?? 1,
            ),
        ];
    },
};
