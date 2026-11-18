/**
 * Происхождение правил теперь живёт в едином реестре shared core (packages/core/src/registry.ts).
 * Этот файл — тонкая совместимая прослойка для старого кода (report.ts), чтобы не тащить
 * историю происхождения в двух местах.
 */
export { getRuleSource, ruleRegistry } from "../../../core/src/index.js";
export type { RuleSourceKind as RuleSource } from "../../../core/src/index.js";
