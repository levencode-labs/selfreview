import { readFileSync } from "node:fs";

interface Profile {
    appUi: string;
    legacyUi: string;
    reactUi: string;
    icons: string;
    typography: string;
    targetApp: string;
    dateImplementation: string;
    sharedUiDirectory: string;
    configFile: string;
    disableDirective: string;
}

const defaults: Profile = {
    appUi: "@example/app-ui",
    legacyUi: "@example/legacy-ui",
    reactUi: "@example/react-ui",
    icons: "@example/icons",
    typography: "@example/typography",
    targetApp: "Web/SampleApp/App",
    dateImplementation: "Web/SharedUi/src/libs/date",
    sharedUiDirectory: "legacy-ui",
    configFile: ".frontend-conventions.json",
    disableDirective: "frontend-conventions-disable",
};

const moduleName = /^(?:@[a-z0-9][a-z0-9_.-]*\/)?[a-z0-9][a-z0-9_.-]*$/;
const directory = /^[\w-]+(?:\/[\w-]+)*$/;
const validators: Record<keyof Profile, RegExp> = {
    appUi: moduleName,
    legacyUi: moduleName,
    reactUi: moduleName,
    icons: moduleName,
    typography: moduleName,
    targetApp: directory,
    dateImplementation: directory,
    sharedUiDirectory: /^[\w-]+$/,
    configFile: /^[\w.-]+\.json$/,
    disableDirective: /^[a-z][a-z0-9-]+$/,
};

function load(): Profile {
    const file = process.env.FRONTEND_CONVENTIONS_PROFILE;
    if (!file) return defaults;
    let input: unknown;
    try {
        input = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    } catch {
        throw new Error("FRONTEND_CONVENTIONS_PROFILE must identify a readable JSON file.");
    }
    if (typeof input !== "object" || !input || Array.isArray(input)) throw new Error("Expected a profile object.");
    const record = input as Record<string, unknown>;
    const keys = Object.keys(validators) as Array<keyof Profile>;
    if (Object.keys(record).length !== keys.length) throw new Error("Expected the keys from profile.example.json.");
    for (const key of keys) {
        const value = record[key];
        if (typeof value !== "string" || !validators[key].test(value)) throw new Error("Invalid profile field " + key);
    }
    return record as unknown as Profile;
}

export const profile = Object.freeze(load());

export function inProfileDirectory(filename: string, directory: string): boolean {
    return ("/" + filename.replace(/\\/g, "/")).includes("/" + directory + "/");
}
