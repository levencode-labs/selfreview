import type { Finding, Rule } from "../../engine/types.js";
import { makeFinding } from "../utils.js";

const MIN_CHANGE_FOR_RATIO_CHECK = 20;
const NOISY_RATIO = 3;

export const misc8: Rule = {
    id: "MISC-8",
    severity: "SHOULD",
    title: "Без шумного диффа (реформат/пробелы не по делу)",
    fileLevel: true,
    appliesTo: (path) => /\.(ts|tsx|js|jsx|scss|css)$/.test(path),
    check(ctx) {
        const { stat, statIgnoreWhitespace, isWhitespaceOnly } = ctx.file;

        if (isWhitespaceOnly) {
            return [
                makeFinding(
                    "MISC-8",
                    "SHOULD",
                    `Все правки в этом файле — только пробелы, переносы строк или отступы; ни одна строка содержательно не поменялась. Похоже на случайный реформат файла целиком (например Ctrl+Alt+L), не относящийся к задаче. Если это не так — не страшно, ложное срабатывание; если так — верни файл как было и вручную поправь только то, что нужно (MISC-8)`,
                    ctx,
                    1,
                ),
            ];
        }

        const total = stat.insertions + stat.deletions;
        const totalNoWs = statIgnoreWhitespace.insertions + statIgnoreWhitespace.deletions;
        if (total >= MIN_CHANGE_FOR_RATIO_CHECK && totalNoWs > 0 && total / totalNoWs >= NOISY_RATIO) {
            const ratio = Math.round(total / totalNoWs);
            return [
                makeFinding(
                    "MISC-8",
                    "SHOULD",
                    `В этом файле изменено ~${total} строк, но если игнорировать пробелы/отступы — содержательных всего ~${totalNoWs} (в ${ratio} раз меньше). Похоже, что вперемешку с фичей файл попутно переформатирован целиком. Это не обязательно ошибка — стоит проверить: если реформат случайный, лучше откатить его и оставить только правки по задаче (MISC-8)`,
                    ctx,
                    1,
                ),
            ];
        }
        return [];
    },
};
