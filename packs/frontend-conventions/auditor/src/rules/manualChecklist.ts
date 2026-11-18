/**
 * Ручной чек-лист договорённостей, которые аудитор принципиально не может проверить по diff'у
 * (процесс/переписка вне git, решения требующие знания вне файла). Единый источник —
 * shared core registry; здесь сохраняем совместимую структуру { id, text, why }.
 */
import { manualChecklistRegistry } from "../../../core/src/index.js";

export interface ManualChecklistItem {
    id: string;
    text: string;
    why: string;
}

export const manualChecklist: ManualChecklistItem[] = manualChecklistRegistry.map((item) => ({
    id: item.id,
    text: item.text,
    why: item.why,
}));
