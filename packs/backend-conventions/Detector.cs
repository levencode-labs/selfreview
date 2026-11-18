using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

static class Detector
{
    private static readonly Lazy<MetadataReference[]> RuntimeReferences = new(() =>
        ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")!).Split(Path.PathSeparator)
        .Where(p => Path.GetFileName(p) is "System.Private.CoreLib.dll" or "System.Runtime.dll" or "System.Threading.Thread.dll")
        .Select(p => (MetadataReference)MetadataReference.CreateFromFile(p)).ToArray());

    public static void Scan(string source, string path, bool test, List<LineRange> changed, List<Finding> findings, List<Diagnostic> diagnostics)
    {
        var tree = CSharpSyntaxTree.ParseText(source, CSharpParseOptions.Default.WithLanguageVersion(LanguageVersion.Latest));
        var errors = tree.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error).ToArray();
        if (errors.Length > 0)
        {
            foreach (var d in errors)
                diagnostics.Add(new(d.Id, path, d.Location.GetLineSpan().StartLinePosition.Line + 1, d.GetMessage()));
            return;
        }

        var root = tree.GetCompilationUnitRoot();
        var seen = new HashSet<(string, int)>();
        void Report(string id, SyntaxNode node)
        {
            var range = tree.GetLineSpan(node.Span);
            var start = range.StartLinePosition.Line + 1;
            var end = tree.GetLineSpan(new Microsoft.CodeAnalysis.Text.TextSpan(node.Span.End - 1, 1)).EndLinePosition.Line + 1;
            var line = changed.Where(r => r.Start <= end && r.End >= start)
                .Select(r => Math.Max(r.Start, start)).DefaultIfEmpty(0).Min();
            if (line > 0 && seen.Add((id, node.SpanStart)))
                findings.Add(new(id, path, line, line == start ? range.StartLinePosition.Character + 1 : 1));
        }

        foreach (var node in root.DescendantNodes())
        {
            if (node is EmptyStatementSyntax empty && RepeatedSemicolon(empty, tree)) Report("CS-001", empty);
            if (node is PropertyDeclarationSyntax property &&
                property.Initializer?.Value is PostfixUnaryExpressionSyntax postfix &&
                postfix.IsKind(SyntaxKind.SuppressNullableWarningExpression) &&
                (postfix.Operand.IsKind(SyntaxKind.DefaultLiteralExpression) || postfix.Operand.IsKind(SyntaxKind.NullLiteralExpression)))
                Report("CS-002", postfix);
        }

        if (!test || changed.Count == 0) return;
        var semantic = CSharpCompilation.Create("Review", [tree], RuntimeReferences.Value).GetSemanticModel(tree);
        foreach (var node in root.DescendantNodes())
        {
            if (node is InvocationExpressionSyntax call && semantic.GetSymbolInfo(call).Symbol is IMethodSymbol method &&
                (method.Name == "Delay" && method.ContainingType.ToDisplayString() == "System.Threading.Tasks.Task" ||
                 method.Name == "Sleep" && method.ContainingType.ToDisplayString() == "System.Threading.Thread"))
                Report("TEST-001", call);

            if (node is AttributeSyntax attribute)
            {
                var marker = TestMarker(attribute, semantic);
                if (marker == "NonParallelizable") Report("TEST-003", attribute);
                if (marker is "Ignore" or "Explicit") Report("TEST-002", attribute);
            }
        }
    }

    private static bool RepeatedSemicolon(EmptyStatementSyntax empty, SyntaxTree tree)
    {
        var parent = empty.Parent;
        var statements = parent switch
        {
            BlockSyntax block => block.Statements,
            SwitchSectionSyntax section => section.Statements,
            _ => default
        };
        var index = statements.IndexOf(empty);
        if (index < 1) return false;
        var previous = statements[index - 1].GetLastToken();
        if (!previous.IsKind(SyntaxKind.SemicolonToken)) return false;
        return tree.GetLineSpan(previous.Span).EndLinePosition.Line == tree.GetLineSpan(empty.Span).StartLinePosition.Line;
    }

    private static string? TestMarker(AttributeSyntax attribute, SemanticModel semantic)
    {
        if (semantic.GetSymbolInfo(attribute).Symbol is IMethodSymbol constructor)
            return constructor.ContainingType.ContainingNamespace.ToDisplayString() == "NUnit.Framework"
                ? MarkerName(constructor.ContainingType.Name)
                : null;

        var name = attribute.Name.ToString().Replace("global::", "", StringComparison.Ordinal);
        if (name.StartsWith("NUnit.Framework.", StringComparison.Ordinal)) return MarkerName(name["NUnit.Framework.".Length..]);
        if (attribute.Name is not IdentifierNameSyntax identifier) return null;
        var imports = attribute.Ancestors().SelectMany(n => n switch
        {
            CompilationUnitSyntax unit => unit.Usings.AsEnumerable(),
            BaseNamespaceDeclarationSyntax ns => ns.Usings.AsEnumerable(),
            _ => []
        }).ToArray();
        var alias = imports.FirstOrDefault(u => u.Alias?.Name.Identifier.ValueText == identifier.Identifier.ValueText);
        if (alias is not null)
        {
            var target = alias.Name?.ToString().Replace("global::", "", StringComparison.Ordinal);
            return target is not null && target.StartsWith("NUnit.Framework.", StringComparison.Ordinal)
                ? MarkerName(target["NUnit.Framework.".Length..])
                : null;
        }
        return imports.Any(u => u.Alias is null && u.Name?.ToString() == "NUnit.Framework")
            ? MarkerName(identifier.Identifier.ValueText)
            : null;
    }

    private static string MarkerName(string value) => value.EndsWith("Attribute", StringComparison.Ordinal) ? value[..^9] : value;
}
