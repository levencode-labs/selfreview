using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true };
var findings = new List<Finding>();
var diagnostics = new List<Diagnostic>();
string? baseSha = null, headSha = null;
var scanned = 0;
var scoped = 0;

try
{
    var catalog = JsonSerializer.Deserialize<Catalog>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "catalog.json")), json)
        ?? throw new InvalidDataException("Empty catalog.");
    if (args is ["rules"])
    {
        Console.WriteLine(JsonSerializer.Serialize(catalog, json));
        return 0;
    }

    if (args is not ["check", var repo, var baseRef, var headRef, var profilePath])
        throw new ArgumentException("Use rules or check <repo> <base> <head> <profile.json>.");

    var profile = JsonSerializer.Deserialize<Profile>(File.ReadAllText(profilePath), json)
        ?? throw new InvalidDataException("Empty scope profile.");
    profile.Validate();
    baseSha = Revision(repo, baseRef);
    headSha = Revision(repo, headRef);

    var diff = Git(repo, "diff", "--name-status", "-z", "--find-renames", baseSha, headSha, "--");
    foreach (var change in Changes(diff))
    {
        if (!profile.Within(change.Path, profile.Include)) continue;
        var isCSharp = change.Path.EndsWith(".cs", StringComparison.OrdinalIgnoreCase) && !Generated(change.Path);
        var isSql = change.Path.EndsWith(".sql", StringComparison.OrdinalIgnoreCase) && profile.Within(change.Path, profile.SqlUtf8);
        if (!isCSharp && !isSql) continue;
        scoped++;

        try
        {
            var arguments = new List<string> { "--literal-pathspecs", "diff", "--unified=0", "--no-color", "--no-ext-diff", "--no-textconv",
                "--find-renames", baseSha, headSha, "--", change.Path };
            if (change.Previous is not null && change.Previous != change.Path) arguments.Add(change.Previous);
            var changed = AddedRanges(Git(repo, [.. arguments]));
            var source = Git(repo, "cat-file", "blob", headSha + ":" + change.Path);
            if (source.IndexOf('\0') >= 0) throw new InvalidDataException("Binary or non-UTF-8 source.");
            scanned++;
            if (isSql)
            {
                if (source.StartsWith('\uFEFF') && changed.Any(r => r.Start <= 1 && r.End >= 1))
                {
                    var before = change.Previous is not null ? Git(repo, "cat-file", "blob", baseSha + ":" + change.Previous) : "";
                    if (!before.StartsWith('\uFEFF')) findings.Add(new("SQL-001", change.Path, 1, 1));
                }
                continue;
            }

            Detector.Scan(source, change.Path, profile.Within(change.Path, profile.Test), changed, findings, diagnostics);
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException or DecoderFallbackException)
        {
            diagnostics.Add(new("SOURCE", change.Path, null, ex.Message));
        }
    }

    Console.WriteLine(JsonSerializer.Serialize(new
    {
        baseSha, headSha, scopedFiles = scoped, scannedFiles = scanned,
        findings = findings.OrderBy(f => f.File, StringComparer.Ordinal).ThenBy(f => f.Line).ThenBy(f => f.Column),
        diagnostics, catalog.ManualChecklist
    }, json));
    return diagnostics.Count == 0 ? findings.Count == 0 ? 0 : 1 : 2;
}
catch (Exception ex) when (ex is ArgumentException or IOException or InvalidDataException or JsonException or System.ComponentModel.Win32Exception)
{
    Console.WriteLine(JsonSerializer.Serialize(new { baseSha, headSha, diagnostics = new[] { new Diagnostic("AUDIT", null, null, ex.Message) } }, json));
    return 2;
}

static string Revision(string repo, string reference) =>
    Git(repo, "rev-parse", "--verify", "--end-of-options", reference + "^{commit}").Trim();

static string Git(string repo, params string[] args)
{
    var start = new ProcessStartInfo("git") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
    start.ArgumentList.Add("-C");
    start.ArgumentList.Add(repo);
    foreach (var arg in args) start.ArgumentList.Add(arg);
    using var process = Process.Start(start) ?? throw new IOException("Git could not start.");
    using var output = new MemoryStream();
    var stdout = process.StandardOutput.BaseStream.CopyToAsync(output);
    var stderr = process.StandardError.ReadToEndAsync();
    Task.WhenAll(stdout, stderr).GetAwaiter().GetResult();
    process.WaitForExit();
    if (process.ExitCode != 0) throw new IOException(stderr.Result.Trim());
    return new UTF8Encoding(false, true).GetString(output.ToArray());
}

static IEnumerable<FileChange> Changes(string diff)
{
    var entries = diff.Split('\0');
    for (var i = 0; i < entries.Length && entries[i].Length != 0;)
    {
        var status = entries[i++];
        var path = entries[i++];
        if (status[0] is 'R' or 'C')
            yield return new FileChange(entries[i++], path);
        else if (status[0] != 'D')
            yield return new FileChange(path, status[0] == 'A' ? null : path);
    }
}

static List<LineRange> AddedRanges(string patch)
{
    var ranges = new List<LineRange>();
    foreach (Match match in Regex.Matches(patch, @"(?m)^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@"))
    {
        var first = int.Parse(match.Groups[1].Value);
        var count = match.Groups[2].Success ? int.Parse(match.Groups[2].Value) : 1;
        if (count != 0) ranges.Add(new(first, first + count - 1));
    }
    return ranges;
}

static bool Generated(string path) => new[] { ".g.cs", ".g.i.cs", ".generated.cs", ".designer.cs" }
    .Any(suffix => path.EndsWith(suffix, StringComparison.OrdinalIgnoreCase));

record Profile(string[] Include, string[] Test, string[] SqlUtf8)
{
    public void Validate()
    {
        if (Include is not { Length: > 0 } || Test is null || SqlUtf8 is null)
            throw new InvalidDataException("Profile requires include, test and sqlUtf8 directory lists.");
        foreach (var path in Include.Concat(Test).Concat(SqlUtf8))
        {
            if (string.IsNullOrWhiteSpace(path) || path.Contains('\\') || path.Contains(':') ||
                path.Split('/').Any(segment => segment is "" or "." or ".."))
                throw new InvalidDataException("Profile paths must be repository-relative directories with forward slashes.");
        }
        if (Test.Concat(SqlUtf8).Any(path => !Include.Any(root => path == root || path.StartsWith(root + "/", StringComparison.Ordinal))))
            throw new InvalidDataException("Test and SQL scopes must be inside include.");
    }

    public bool Within(string path, string[] roots) => roots.Any(root => path.StartsWith(root + "/", StringComparison.Ordinal));
}

record Catalog(Rule[] Rules, ManualCheck[] ManualChecklist);
record Rule(string Id, string Severity, string Title, string Basis);
record ManualCheck(string Id, string Text);
record FileChange(string Path, string? Previous);
record Finding(string Rule, string File, int Line, int Column);
record Diagnostic(string Code, string? File, int? Line, string Message);
record LineRange(int Start, int End);
