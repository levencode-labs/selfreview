import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { Linter } from "eslint";
import parser from "@typescript-eslint/parser";
import { fileURLToPath } from "node:url";

process.env.FRONTEND_CONVENTIONS_PROFILE = fileURLToPath(new URL("../profile.example.json", import.meta.url));
const { allRules, defaultConfig, runRules } = await import("../dist/auditor/src/index.js");
const { default: frontend } = await import("../dist/eslint-plugin/src/index.js");

const matrix = JSON.parse(readFileSync(new URL("./matrix.json", import.meta.url), "utf8"));
const byId = new Map(allRules.map(rule => [rule.id, rule]));
const scope = "Web/SampleApp/App/";
const tempRoot = realpathSync(tmpdir());
const scratch = mkdtempSync(join(tempRoot, "frontend-conventions-"));
const failures = [];
let parity = 0;

function evaluate(entry, index) {
    const path = entry.path?.startsWith("Web/") ? entry.path : scope + (entry.path ?? "components/Catalog/Catalog.tsx");
    const rule = byId.get(entry.rule);
    assert.ok(rule, entry.rule);
    const status = entry.status ?? "added";
    const addedLines = new Set(entry.changed ?? entry.source.split("\n").map((_, i) => i + 1));
    const stats = { insertions: addedLines.size, deletions: 0 };
    const file = { path, status, addedLines, isWhitespaceOnly: !!entry.whitespaceOnly,
        stat: entry.stat ?? stats, statIgnoreWhitespace: entry.statNoWs ?? stats };
    const related = new Map(Object.entries(entry.related ?? {}).map(([name, code]) => [posix.join(posix.dirname(path), name), code]));
    const repoRoot = join(scratch, String(index));
    const diagnostics = [];
    const findings = runRules({
        repoRoot, files: [file], rules: [rule], config: defaultConfig, readSource: () => entry.source,
        readRelatedSource: name => related.get(name), hasRelatedFile: (_, name) => related.has(name),
        listRelatedFiles: name => [...related.keys()].filter(path => path.startsWith(name + "/")),
        onInternalDiagnostic: item => diagnostics.push(item),
    });
    const scenario = entry.rule + " / " + entry.form;
    assert.deepEqual(diagnostics, [], scenario);
    assert.equal(findings.length > 0, entry.expected, scenario);
    if (entry.suggestion) assert.ok(findings.some(item => item.suggestions?.some(s => s.fix.text === entry.suggestion)), scenario);

    const name = entry.rule.toLowerCase();
    if (entry.auditorOnly || !frontend.rules[name]) return;
    for (const [relative, code] of related) {
        assert.ok(relative.startsWith(scope), relative);
        const target = join(repoRoot, relative);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, code, "utf8");
    }
    const linter = new Linter({ cwd: repoRoot });
    const id = "frontend/" + name;
    const state = { repoRoot, addedLines, isNew: status === "added" || status === "renamed",
        isRenamed: status === "renamed", isDeleted: status === "deleted" };
    const messages = linter.verify(entry.source, {
        files: ["**/*.*"],
        languageOptions: { parser: /\.(css|scss)$/.test(path) ? frontend.cssParser : parser },
        plugins: { frontend },
        rules: { [id]: ["error", { state }] },
    }, path);
    assert.ok(messages.every(item => !item.fatal), scenario);
    const summarize = rows => rows.map(r => [r.line, r.message]).sort();
    assert.deepEqual(summarize(messages.filter(item => item.ruleId === id && (rule.fileLevel || addedLines.has(item.line)))),
        summarize(findings), scenario);
    parity++;
}

try {
    const covered = new Set(matrix.map(item => item.rule));
    assert.deepEqual(covered, new Set(byId.keys()));
    for (const rule of byId.keys()) {
        assert.ok(matrix.filter(item => item.rule === rule && item.expected).length >= 2, rule + " positive forms");
        assert.ok(matrix.some(item => item.rule === rule && !item.expected && !item.manual), rule + " control");
    }
    for (const [index, entry] of matrix.entries()) {
        try {
            evaluate(entry, index);
        } catch (error) {
            failures.push(entry.rule + " / " + entry.form + "\n" + error.message);
        }
    }
} finally {
    assert.equal(dirname(realpathSync(scratch)), tempRoot);
    rmSync(scratch, { recursive: true, force: true });
}
assert.deepEqual(failures, []);
console.log(JSON.stringify({ rules: byId.size, cases: matrix.length, parity, manual: matrix.filter(item => item.manual).length }));
