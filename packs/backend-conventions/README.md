# Backend Conventions

[Русский](README.ru.md)

A Git-diff review pack for C# and SQL. The shared catalog contains review signals for C#, MVC, tests and SQL and a manual review checklist. [Catalog](catalog.json)

[Manual review scenarios and expected outcomes](../../examples/conventions/review-scenarios.json)

## Restore from a clone

Enter `packs/backend-conventions` with Git, the .NET 10 SDK and Node.js for the matrix. The build uses Roslyn from the SDK.

```text
dotnet build
node checks/run.mjs
dotnet bin/Debug/net10.0/BackendConventions.dll rules
```

Copy the skill to a `backend-conventions` folder in your Codex or OpenCode user skills directory. Set `BACKEND_CONVENTIONS_ROOT` to the absolute path of this pack. [Skill](skills/backend-conventions/SKILL.md)

## Review a diff

Resolve the exact base and head for the review. Copy the sample profile to a local ignored location and replace its repository-relative directory lists. Use `include` for the review boundary, `test` for confirmed test sources and page objects, and `sqlUtf8` for SQL directories with a confirmed UTF-8 policy without BOM. `uiTest` optionally enables Playwright signals in confirmed UI test and page object directories within `test`. The XPath check recognizes the explicit selector engine in that scope. Implicit XPath and fixed waits require a visible Playwright receiver type. [Sample profile](profile.example.json)

```text
dotnet bin/Debug/net10.0/BackendConventions.dll check <repo> <base> <head> <profile.json>
```

The JSON report includes revisions, file counts, findings, diagnostics, and the manual checklist. Exit 0 denotes no automatic signals in the scanned scope, 1 denotes review findings, and 2 denotes incomplete analysis. Verify applicability and exceptions for each finding.

C# analysis uses the current file and standard .NET references. Project-wide symbol binding, cross-file global usings, generated code and inactive preprocessor branches require project tools. NUnit marker checks can use explicit syntax. The SQL check covers newly introduced BOM bytes. Transaction boundaries, migration behavior, and domain contracts go through manual review. [Synthetic matrix](checks/matrix.json)
