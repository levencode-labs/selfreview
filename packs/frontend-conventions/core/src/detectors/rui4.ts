import { profile } from "../profile.js";
import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";
import { makeFinding } from "./helpers.js";

/** Базовые примитивы react-ui: если импортируем их из legacy-ui-modern/components/* — обходим через @example/react-ui. */
const BASE_COMPONENTS = new Set([
    "Checkbox",
    "CheckboxGroup",
    "Input",
    "Textarea",
    "Button",
    "Group",
    "InputGroup",
    "Select",
    "NativeSelect",
    "Radio",
    "RadioGroup",
    "ControlGroup",
    "Tabs",
    "Tab",
    "Tooltip",
    "Hint",
    "Modal",
    "Confirm",
    "DatePicker",
    "DateRangePicker",
    "TokenInput",
    "Autocomplete",
    "ComboBox",
    "Menu",
    "MenuItem",
    "Loader",
    "Spinner",
    "Kebab",
    "DropdownMenu",
    "Paging",
    "Switcher",
    "Toggle",
    "FileUploader",
    "CurrencyInput",
    "Slider",
]);

const componentsPrefix = profile.appUi + "/components/";

/**
 * RUI-4: базовые компоненты (Checkbox/Input/Button/Select/...) берём из @example/react-ui,
 * а не из @example/app-ui/components/<Name> — legacy-ui-modern оборачивает их прикладными
 * правками, которые для базовых примитивов не нужны.
 * Severity — MUST.
 */
export function detectRui4(
    program: TSESTree.Program | null,
    _sourceText: string,
    filePath: string,
    _state: import("./helpers.js").DetectorState = {},
): Finding[] {
    if (!program || !/\.(ts|tsx)$/.test(filePath) || filePath.endsWith(".d.ts")) return [];

    const findings: Finding[] = [];
    for (const stmt of program.body) {
        if (stmt.type !== "ImportDeclaration") continue;
        const source = typeof stmt.source?.value === "string" ? stmt.source.value : "";
        if (!source.startsWith(componentsPrefix)) continue;
        const componentName = source.slice(componentsPrefix.length).split("/")[0].replace(/\.(?:tsx?|jsx?)$/, "");
        if (!BASE_COMPONENTS.has(componentName)) continue;
        if (!stmt.loc) continue;

        findings.push(
            makeFinding(
                "RUI-4",
                "MUST",
                `Базовый компонент "${componentName}" импортируется из ${profile.appUi}/components — бери из ${profile.reactUi} (base-примитивы не оборачиваем) (RUI-4)`,
                filePath,
                { start: { line: stmt.loc.start.line, column: stmt.loc.start.column } },
            ),
        );
    }

    return findings;
}
