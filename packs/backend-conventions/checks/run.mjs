import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const pack = fileURLToPath(new URL("../", import.meta.url));
const matrix = JSON.parse(readFileSync(new URL("matrix.json", import.meta.url), "utf8"));
const expectedCatalog = JSON.parse(readFileSync(new URL("../catalog.json", import.meta.url), "utf8"));
const assembly = join(pack, "bin", "Debug", "net10.0", "BackendConventions.dll");
const profile = join(pack, "profile.example.json");
const tempRoot = realpathSync(tmpdir());
const scratch = mkdtempSync(join(tempRoot, "backend-conventions-"));
const repo = join(scratch, "repo");
mkdirSync(repo);

function git(...args) {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function commit(message) {
    git("add", "-A");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false",
        "-c", "core.hooksPath=" + join(scratch, "disabled-hooks"), "commit", "-qm", message);
    return git("rev-parse", "HEAD");
}
function write(relative, content) {
    const file = join(repo, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content, "utf8");
}
function check(base, head, exit, scope = profile) {
    const result = spawnSync("dotnet", [assembly, "check", repo, base, head, scope], {
        encoding: "utf8", cwd: pack,
    });
    assert.equal(result.status, exit, result.stderr || result.stdout);
    return JSON.parse(result.stdout);
}
try {
    const actualCatalog = JSON.parse(execFileSync("dotnet", [assembly, "rules"], { encoding: "utf8" }));
    assert.deepEqual(actualCatalog, expectedCatalog);
    const ids = new Set(actualCatalog.rules.map(rule => rule.id));
    assert.deepEqual(new Set(matrix.map(entry => entry.id)), ids);
    for (const id of ids) {
        assert.ok(matrix.filter(c => c.id === id && c.expected).length >= 2, id + " positive forms");
        assert.ok(matrix.filter(c => c.id === id && !c.expected).length >= 2, id + " controls");
    }

    git("init", "-q");
    git("config", "core.autocrlf", "false");
    write("readme.txt", "Fixture");
    for (const entry of matrix) if (entry.before !== undefined) write(entry.path, entry.before);
    const base = commit("Base");

    for (const entry of matrix) write(entry.path, entry.after);
    const good = commit("Matrix");
    const report = check(base, good, 1);
    assert.equal(report.baseSha, base);
    assert.equal(report.headSha, good);
    assert.deepEqual(report.manualChecklist, expectedCatalog.manualChecklist);
    assert.deepEqual(report.diagnostics, []);
    for (const entry of matrix) {
        const findings = report.findings.filter(item => item.file === entry.path && item.rule === entry.id);
        assert.equal(findings.length > 0, entry.expected, entry.id + " " + entry.form);
        if (entry.line) assert.equal(findings[0].line, entry.line, entry.form);
    }
    const cases = new Set(matrix.filter(entry => entry.expected).map(entry => entry.path + " " + entry.id));
    assert.deepEqual(new Set(report.findings.map(f => f.file + " " + f.rule)), cases);

    assert.equal(check(good, good, 0).scannedFiles, 0);
    write("src/Example/Broken.cs", "public class Broken {");
    write("src/Example/Visible.cs", "class Route { void Execute() { Execute();; } }");
    const broken = check(good, commit("Invalid syntax"), 2);
    assert.ok(broken.diagnostics.some(item => item.file.endsWith("Broken.cs")));
    assert.ok(broken.findings.some(item => item.file.endsWith("Visible.cs")));

    const badProfile = join(scratch, "invalid.json");
    writeFileSync(badProfile, JSON.stringify({ include: ["src/Example"], test: ["tests/Example"], sqlUtf8: [] }));
    assert.equal(check(good, good, 2, badProfile).diagnostics[0].code, "AUDIT");
    const compatible = join(scratch, "legacy.json");
    const legacy = JSON.parse(readFileSync(profile, "utf8"));
    delete legacy.uiTest;
    writeFileSync(compatible, JSON.stringify(legacy));
    assert.deepEqual(check(base, good, 1, compatible).findings, report.findings.filter(
        item => item.rule !== "TEST-004" && item.rule !== "TEST-005"));
    writeFileSync(badProfile, JSON.stringify({ ...legacy, uiTest: ["src/Example"] }));
    assert.equal(check(good, good, 2, badProfile).diagnostics[0].code, "AUDIT");
    console.log(JSON.stringify({ rules: ids.size, scenarios: matrix.length, positive: cases.size,
        manual: report.manualChecklist.length, gitAndIncompleteChecks: true }));
} finally {
    assert.equal(dirname(realpathSync(scratch)), tempRoot);
    rmSync(scratch, { recursive: true, force: true });
}
