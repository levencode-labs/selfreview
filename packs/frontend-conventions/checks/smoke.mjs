import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const tempRoot = realpathSync(tmpdir());
const scratch = mkdtempSync(join(tempRoot, "frontend-conventions-cli-"));
const repo = join(scratch, "project");
mkdirSync(repo);
const entry = fileURLToPath(new URL("../dist/auditor/src/cli.js", import.meta.url));
const env = { ...process.env, FRONTEND_CONVENTIONS_PROFILE: "" };
const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function write(relative, content) {
    const file = join(repo, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content, "utf8");
}
function commit(message) {
    git("add", "-A");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false",
        "-c", "core.hooksPath=" + join(scratch, "disabled-hooks"), "commit", "-qm", message);
    return git("rev-parse", "HEAD");
}
function check(base, head, expected) {
    const run = spawnSync(process.execPath, [entry, "check", "--repo", repo, "--base", base,
        "--head", head, "--format", "json", "--strict"], { env, encoding: "utf8" });
    assert.equal(run.status, expected, run.stderr || run.stdout);
    return JSON.parse(run.stdout);
}

try {
    git("init", "-q");
    write("base.txt", "synthetic fixture\n");
    const base = commit("base");
    const settings = JSON.parse(readFileSync(new URL("../profile.example.json", import.meta.url), "utf8"));
    settings.targetApp = "Web/ExampleCustom/App";
    settings.reactUi = "@fixtures/react-kit";
    settings.configFile = ".project-review.json";
    settings.disableDirective = "fixture-review-disable";
    const profilePath = join(scratch, "profile.json");
    writeFileSync(profilePath, JSON.stringify(settings));
    const source = "import * as UI from '@fixtures/react-kit';\nexport const Row = () => <UI.Gapped/>;\n";
    write(settings.targetApp + "/components/Row/Row.tsx", source);
    write("Web/Unrelated/App/components/Row/Row.tsx", source);
    write("debug.ts", "// fixture-review-disable TS-3\nconsole.log('example');\n");
    const head = commit("authored fixture");
    env.FRONTEND_CONVENTIONS_PROFILE = profilePath;
    const report = check(base, head, 0);
    assert.equal(report.findings.filter(item => item.ruleId === "RUI-5").length, 1);
    assert.ok(report.findings.find(item => item.ruleId === "RUI-5").file.startsWith(settings.targetApp + "/"));
    assert.ok(!report.findings.some(item => item.ruleId === "TS-3"));
    assert.equal(report.manualChecklist.length, 26);

    write("debug.ts", "console.log('changed example');\n");
    const problem = commit("visible violation");
    assert.ok(check(head, problem, 1).findings.some(item => item.ruleId === "TS-3"));
    write("broken.tsx", "export const Broken = () => <div>;");
    const broken = commit("syntax error");
    assert.ok(check(problem, broken, 2).internalDiagnostics.some(item => item.code === "PARSE_FAILED"));
    console.log("CLI Git snapshots, profile scope, suppression, checklist and incomplete result verified.");
} finally {
    assert.equal(dirname(realpathSync(scratch)), tempRoot);
    rmSync(scratch, { recursive: true, force: true });
}
