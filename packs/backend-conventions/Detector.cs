using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

static class Detector
{
    private static readonly Lazy<MetadataReference[]> RuntimeReferences = new(() =>
        ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")!).Split(Path.PathSeparator)
        .Where(p => Path.GetFileName(p) is "System.Private.CoreLib.dll" or "System.Runtime.dll" or "System.Threading.Thread.dll" or "System.Linq.dll")
        .Select(p => (MetadataReference)MetadataReference.CreateFromFile(p)).ToArray());

    public static void Scan(string source, string path, bool test, bool uiTest, List<LineRange> changed, List<Finding> findings, List<Diagnostic> diagnostics)
    {
        var tree = CSharpSyntaxTree.ParseText(source, CSharpParseOptions.Default.WithLanguageVersion(LanguageVersion.Latest));
        var errors = tree.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error).ToArray();
        if (errors.Length > 0)
        {
            foreach (var d in errors)
                diagnostics.Add(new(d.Id, path, d.Location.GetLineSpan().StartLinePosition.Line + 1, d.GetMessage()));
            return;
        }

        if (changed.Count == 0) return;
        var root = tree.GetCompilationUnitRoot();
        var semanticModel = new Lazy<SemanticModel>(() =>
            CSharpCompilation.Create("Review", [tree], RuntimeReferences.Value).GetSemanticModel(tree));
        SemanticModel Semantic() => semanticModel.Value;
        var seen = new HashSet<(string, int)>();
        bool Report(string id, SyntaxNode node)
        {
            var range = tree.GetLineSpan(node.Span);
            var start = range.StartLinePosition.Line + 1;
            var end = tree.GetLineSpan(new Microsoft.CodeAnalysis.Text.TextSpan(node.Span.End - 1, 1)).EndLinePosition.Line + 1;
            var line = changed.Where(r => r.Start <= end && r.End >= start)
                .Select(r => Math.Max(r.Start, start)).DefaultIfEmpty(0).Min();
            if (line == 0) return false;
            if (seen.Add((id, node.SpanStart)))
                findings.Add(new(id, path, line, line == start ? range.StartLinePosition.Character + 1 : 1));
            return true;
        }

        foreach (var node in root.DescendantNodes())
        {
            if (node is EmptyStatementSyntax empty && RepeatedSemicolon(empty, tree)) Report("CS-001", empty);
            if (node is PropertyDeclarationSyntax property &&
                property.Initializer?.Value is PostfixUnaryExpressionSyntax postfix &&
                postfix.IsKind(SyntaxKind.SuppressNullableWarningExpression) &&
                (postfix.Operand.IsKind(SyntaxKind.DefaultLiteralExpression) || postfix.Operand.IsKind(SyntaxKind.NullLiteralExpression)))
                Report("CS-002", postfix);

            if (node is CatchClauseSyntax { Block.Statements.Count: 0 } handler &&
                !handler.DescendantTrivia().Any(t => t.IsKind(SyntaxKind.SingleLineCommentTrivia) ||
                    t.IsKind(SyntaxKind.MultiLineCommentTrivia) || t.IsKind(SyntaxKind.DisabledTextTrivia)))
                Report("CS-005", handler);

            if (node is BinaryExpressionSyntax comparison &&
                comparison.Kind() is SyntaxKind.EqualsExpression or SyntaxKind.NotEqualsExpression &&
                BooleanComparison(comparison, Semantic))
                Report("CS-004", comparison);

            if (node is InvocationExpressionSyntax call)
            {
                CheckCall(call);
                continue;
            }

            if (node is MemberAccessExpressionSyntax { Name.Identifier.ValueText: "Result" } result &&
                Semantic().GetSymbolInfo(result).Symbol is IPropertySymbol propertySymbol &&
                TaskType(propertySymbol.ContainingType) && InsideAsync(result))
                Report("ASYNC-001", result);

            if (test && node is AttributeSyntax attribute)
            {
                var marker = AttributeName(attribute, Semantic(), "NUnit.Framework");
                if (marker == "NonParallelizable") Report("TEST-003", attribute);
                if (marker is "Ignore" or "Explicit") Report("TEST-002", attribute);
            }

            if (node is MethodDeclarationSyntax { AttributeLists.Count: > 0 } action)
            {
                var routeAttributes = action.AttributeLists.SelectMany(list => list.Attributes)
                    .Select(a => (Attribute: a, Name: AttributeName(a, Semantic(), "Microsoft.AspNetCore.Mvc")))
                    .Where(a => a.Name is "Route" or "HttpGet" or "HttpPost" or "HttpPut" or "HttpDelete" or
                        "HttpPatch" or "HttpHead" or "HttpOptions" or "AcceptVerbs")
                    .ToArray();
                var routes = routeAttributes.Where(a => a.Name == "Route").ToArray();
                if (routeAttributes.Length == 2 && routes.Length == 1 &&
                    routes[0].Attribute is { } route &&
                    route.ArgumentList?.Arguments is [{ NameColon: null, NameEquals: null, Expression: LiteralExpressionSyntax template }] &&
                    template.IsKind(SyntaxKind.StringLiteralExpression) &&
                    routeAttributes.Any(a => a.Name!.StartsWith("Http", StringComparison.Ordinal) &&
                        (a.Attribute.ArgumentList is null || a.Attribute.ArgumentList.Arguments.Count == 0)))
                {
                    if (!Report("API-002", route))
                        Report("API-002", routeAttributes.Single(a => a.Name != "Route").Attribute);
                }
            }

            if (node is IfStatementSyntax guard && ModelStateGuard(guard, Semantic) &&
                guard.Ancestors().OfType<ClassDeclarationSyntax>().FirstOrDefault() is { } controller &&
                controller.AttributeLists.SelectMany(list => list.Attributes)
                    .Any(a => AttributeName(a, Semantic(), "Microsoft.AspNetCore.Mvc") == "ApiController"))
                Report("API-001", guard);
        }

        void CheckCall(InvocationExpressionSyntax call)
        {
            if (call.Expression is not (MemberAccessExpressionSyntax or SimpleNameSyntax)) return;
            var name = call.Expression is MemberAccessExpressionSyntax qualified
                ? qualified.Name.Identifier.ValueText
                : ((SimpleNameSyntax)call.Expression).Identifier.ValueText;
            if (name is "Delay" or "Sleep" or "Count" or "Wait" or "GetResult" or "Locator" or "WaitForTimeoutAsync" &&
                Semantic().GetSymbolInfo(call).Symbol is IMethodSymbol method)
            {
                if (test && (method.Name == "Delay" && method.ContainingType.ToDisplayString() == "System.Threading.Tasks.Task" ||
                             method.Name == "Sleep" && method.ContainingType.ToDisplayString() == "System.Threading.Thread"))
                    Report("TEST-001", call);
                if (name == "Count" && MaterializedCount(call, method, Semantic()))
                    Report("CS-003", call);
                if ((name == "Wait" && TaskType(method.ContainingType) ||
                     name == "GetResult" && IsTaskGetResult(call, Semantic())) && InsideAsync(call))
                    Report("ASYNC-001", call);
                return;
            }

            if (!uiTest || call.Expression is not MemberAccessExpressionSyntax member) return;

            // shortcut: use the visible receiver type or explicit XPath engine until project references are available.
            if (name == "WaitForTimeoutAsync" && PlaywrightReceiver(member.Expression, Semantic()))
                Report("TEST-005", call);
            if (name != "Locator" ||
                call.ArgumentList.Arguments.FirstOrDefault()?.Expression is not LiteralExpressionSyntax selector ||
                !selector.IsKind(SyntaxKind.StringLiteralExpression)) return;
            var value = selector.Token.ValueText;
            var typed = PlaywrightReceiver(member.Expression, Semantic());
            if (value.StartsWith("xpath=", StringComparison.Ordinal) &&
                (typed || Semantic().GetSymbolInfo(member.Expression).Symbol is null) ||
                typed && (value.StartsWith("//", StringComparison.Ordinal) || value.StartsWith("..//", StringComparison.Ordinal)))
                Report("TEST-004", call);
        }
    }

    private static bool BooleanComparison(BinaryExpressionSyntax comparison, Func<SemanticModel> semantic)
    {
        var left = Unwrap(comparison.Left);
        var right = Unwrap(comparison.Right);
        bool Literal(ExpressionSyntax expression) => expression.Kind() is SyntaxKind.TrueLiteralExpression or SyntaxKind.FalseLiteralExpression;
        return Literal(left) != Literal(right) &&
            semantic().GetTypeInfo(Literal(left) ? right : left).Type?.SpecialType == SpecialType.System_Boolean;
    }

    private static ExpressionSyntax Unwrap(ExpressionSyntax expression)
    {
        while (expression is ParenthesizedExpressionSyntax parentheses) expression = parentheses.Expression;
        return expression;
    }

    private static bool MaterializedCount(InvocationExpressionSyntax call, IMethodSymbol method, SemanticModel semantic)
    {
        var original = method.ReducedFrom ?? method;
        if (original.Parameters.Length != 1 || original.ContainingType.ToDisplayString() != "System.Linq.Enumerable")
            return false;
        var sequence = method.ReducedFrom is not null && call.Expression is MemberAccessExpressionSyntax member
            ? member.Expression
            : call.ArgumentList.Arguments.FirstOrDefault()?.Expression;
        if (sequence is null) return false;
        var type = semantic.GetTypeInfo(sequence).Type;
        return type is IArrayTypeSymbol { Rank: 1 } ||
            type?.OriginalDefinition.ToDisplayString() == "System.Collections.Generic.List<T>";
    }

    private static bool TaskType(ITypeSymbol? type) => type?.OriginalDefinition.ToDisplayString() is
        "System.Threading.Tasks.Task" or "System.Threading.Tasks.Task<TResult>" or
        "System.Threading.Tasks.ValueTask" or "System.Threading.Tasks.ValueTask<TResult>";

    private static bool IsTaskGetResult(InvocationExpressionSyntax call, SemanticModel semantic) =>
        call.Expression is MemberAccessExpressionSyntax
        {
            Expression: InvocationExpressionSyntax
            {
                Expression: MemberAccessExpressionSyntax { Name.Identifier.ValueText: "GetAwaiter", Expression: var task }
            }
        } && TaskType(semantic.GetTypeInfo(task).Type);

    private static bool InsideAsync(SyntaxNode node) =>
        node.Ancestors().FirstOrDefault(n => n is MethodDeclarationSyntax or LocalFunctionStatementSyntax or AnonymousFunctionExpressionSyntax) switch
        {
            MethodDeclarationSyntax method => method.Modifiers.Any(SyntaxKind.AsyncKeyword),
            LocalFunctionStatementSyntax local => local.Modifiers.Any(SyntaxKind.AsyncKeyword),
            AnonymousFunctionExpressionSyntax function => function.AsyncKeyword.IsKind(SyntaxKind.AsyncKeyword),
            _ => false
        };

    private static bool ModelStateGuard(IfStatementSyntax guard, Func<SemanticModel> semantic)
    {
        if (Unwrap(guard.Condition) is not PrefixUnaryExpressionSyntax negation || !negation.IsKind(SyntaxKind.LogicalNotExpression) ||
            Unwrap(negation.Operand) is not MemberAccessExpressionSyntax { Name.Identifier.ValueText: "IsValid", Expression: var state } ||
            !IsNamedMember(state, "ModelState"))
            return false;
        var statement = guard.Statement is BlockSyntax { Statements: [var only] } ? only : guard.Statement;
        if (statement is not ReturnStatementSyntax { Expression: InvocationExpressionSyntax failure } ||
            !IsNamedMember(failure.Expression, "BadRequest"))
            return false;

        // shortcut: the inherited MVC members are unresolved without project references.
        return semantic().GetSymbolInfo(state).Symbol?.Locations.Any(location => location.IsInSource) != true &&
            semantic().GetSymbolInfo(failure).Symbol?.Locations.Any(location => location.IsInSource) != true;
    }

    private static bool IsNamedMember(ExpressionSyntax expression, string name) => expression switch
    {
        IdentifierNameSyntax id => id.Identifier.ValueText == name,
        MemberAccessExpressionSyntax { Expression: ThisExpressionSyntax or BaseExpressionSyntax } member => member.Name.Identifier.ValueText == name,
        _ => false
    };

    private static bool PlaywrightReceiver(ExpressionSyntax receiver, SemanticModel semantic)
    {
        var symbol = semantic.GetSymbolInfo(receiver).Symbol;
        var type = symbol switch
        {
            IFieldSymbol field => field.Type,
            ILocalSymbol local => local.Type,
            IParameterSymbol parameter => parameter.Type,
            IPropertySymbol property => property.Type,
            _ => null
        };
        if (type is not IErrorTypeSymbol error) return false;
        if (error.Name is not ("IPage" or "ILocator" or "IFrameLocator")) return false;
        var typeName = symbol!.DeclaringSyntaxReferences.FirstOrDefault()?.GetSyntax() switch
        {
            ParameterSyntax parameter => parameter.Type,
            VariableDeclaratorSyntax { Parent: VariableDeclarationSyntax variable } => variable.Type,
            PropertyDeclarationSyntax property => property.Type,
            _ => null
        };
        if (typeName is null) return false;
        if (typeName.ToString().Replace("global::", "", StringComparison.Ordinal) == "Microsoft.Playwright." + error.Name) return true;
        return typeName is IdentifierNameSyntax identifier && identifier.Identifier.ValueText == error.Name &&
            Imports(typeName).Any(u => u.Alias is null && u.Name?.ToString() == "Microsoft.Playwright") &&
            !Imports(typeName).Any(u => u.Alias?.Name.Identifier.ValueText == error.Name);
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

    private static string? AttributeName(AttributeSyntax attribute, SemanticModel semantic, string attributeNamespace)
    {
        if (semantic.GetSymbolInfo(attribute).Symbol is IMethodSymbol constructor)
            return constructor.ContainingType.ContainingNamespace.ToDisplayString() == attributeNamespace
                ? MarkerName(constructor.ContainingType.Name)
                : null;

        var prefix = attributeNamespace + ".";
        var name = attribute.Name.ToString().Replace("global::", "", StringComparison.Ordinal);
        if (name.StartsWith(prefix, StringComparison.Ordinal)) return MarkerName(name[prefix.Length..]);
        if (attribute.Name is not IdentifierNameSyntax identifier) return null;
        var imports = Imports(attribute).ToArray();
        var alias = imports.FirstOrDefault(u => u.Alias?.Name.Identifier.ValueText == identifier.Identifier.ValueText);
        if (alias is not null)
        {
            var target = alias.Name?.ToString().Replace("global::", "", StringComparison.Ordinal);
            return target is not null && target.StartsWith(prefix, StringComparison.Ordinal)
                ? MarkerName(target[prefix.Length..])
                : null;
        }
        return imports.Any(u => u.Alias is null && u.Name?.ToString() == attributeNamespace)
            ? MarkerName(identifier.Identifier.ValueText)
            : null;
    }

    private static IEnumerable<UsingDirectiveSyntax> Imports(SyntaxNode node) => node.Ancestors().SelectMany(n => n switch
    {
        CompilationUnitSyntax unit => unit.Usings.AsEnumerable(),
        BaseNamespaceDeclarationSyntax ns => ns.Usings.AsEnumerable(),
        _ => []
    });

    private static string MarkerName(string value) => value.EndsWith("Attribute", StringComparison.Ordinal) ? value[..^9] : value;
}
