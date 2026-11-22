import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { assert, contained, digest, matches, posix, sha256, EXCLUDED_DIRS, EXTENSIONS, readJson } from './util.mjs';
import { projectInfo, mutateCatalog } from './config.mjs';
import { stableCandidateId } from './rules.mjs';
import { mergeLearnedCandidates } from './lifecycle.mjs';

// Deliberately syntax-only: no tsconfig plugins, project imports, or user code are loaded.
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_EXAMPLES = 8;
const MAX_GROUPS = 200;
const MAX_KNOWLEDGE_BYTES = 8 * 1024 * 1024;
const CODE_EXTENSIONS = new Set(EXTENSIONS);
const safeLabel = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 180);
const relativePath = (root, filename) => posix(path.relative(root, filename));
const isComponentName = name => /^[A-Z][A-Za-z0-9_$]*$/.test(name);
const isHookName = name => /^use[A-Z][A-Za-z0-9_$]*$/.test(name);

function validateOptions(options) {
  const minFiles = options.minFiles ?? 3;
  const maxFiles = options.maxFiles ?? 20000;
  const maxPatterns = options.maxPatterns ?? 60;
  assert(Number.isSafeInteger(minFiles) && minFiles >= 2 && minFiles <= 10000, 'minFiles must be 2..10000');
  assert(Number.isSafeInteger(maxFiles) && maxFiles >= 1 && maxFiles <= 100000, 'maxFiles must be 1..100000');
  assert(Number.isSafeInteger(maxPatterns) && maxPatterns >= 1 && maxPatterns <= 200, 'maxPatterns must be 1..200');
  return { minFiles, maxFiles, maxPatterns };
}

function selectedRoots(project, codePaths) {
  const values = codePaths?.length ? codePaths : [project.root];
  const roots = values.map(value => {
    const absolute = path.resolve(value);
    assert(fs.existsSync(absolute) && fs.statSync(absolute).isDirectory(), 'Code root is not a directory: ' + value);
    const real = fs.realpathSync(absolute);
    assert(contained(project.root, real), 'Code root is outside the selected project: ' + value);
    return real;
  });
  const unique = [...new Set(roots)].sort();
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      assert(!contained(unique[i], unique[j]), 'Overlapping --code roots are not allowed');
    }
  }
  return unique;
}

function findImports(sourceFile) {
  const bindings = new Map();
  function bind(name, module, imported) {
    if (name) bindings.set(name, { module, imported });
  }
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const module = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (clause?.name) bind(clause.name.text, module, 'default');
    if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      bind(clause.namedBindings.name.text, module, '*');
    } else if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const item of clause.namedBindings.elements) {
        bind(item.name.text, module, item.propertyName?.text ?? item.name.text);
      }
    }
  }
  return bindings;
}

function containsJsx(node) {
  if (!node) return false;
  let found = false;
  function visit(child) {
    if (found) return;
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
}

function argumentShape(node) {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return 'callback';
  if (ts.isObjectLiteralExpression(node)) return 'object';
  if (ts.isArrayLiteralExpression(node)) return 'array';
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node) || node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return 'literal';
  return 'expression';
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function extractPatterns(sourceFile, observe) {
  const bindings = findImports(sourceFile);
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const module = statement.moduleSpecifier.text;
      if (!module.startsWith('.') && module.length <= 180) observe('import-source', module, lineOf(sourceFile, statement));
    }
    if (ts.isFunctionDeclaration(statement) && statement.name && isComponentName(statement.name.text) && containsJsx(statement.body)) {
      observe('component-style', 'function-declaration', lineOf(sourceFile, statement));
    }
    if (ts.isVariableStatement(statement)) {
      for (const item of statement.declarationList.declarations) {
        if (!ts.isIdentifier(item.name) || !isComponentName(item.name.text) || !item.initializer) continue;
        if ((ts.isArrowFunction(item.initializer) || ts.isFunctionExpression(item.initializer)) && containsJsx(item.initializer.body)) {
          observe('component-style', 'function-expression-or-arrow', lineOf(sourceFile, statement));
        }
      }
    }
    if (ts.isClassDeclaration(statement) && statement.name && isComponentName(statement.name.text)) {
      const render = statement.members.find(member => member.name?.getText(sourceFile) === 'render');
      if (render && containsJsx(render)) observe('component-style', 'class-render', lineOf(sourceFile, statement));
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) observe('export-style', 'default', lineOf(sourceFile, statement));
    if (ts.isExportDeclaration(statement) && statement.exportClause) observe('export-style', 'named-re-export', lineOf(sourceFile, statement));
  }

  function hook(call) {
    const expression = call.expression;
    if (ts.isIdentifier(expression) && isHookName(expression.text) && bindings.has(expression.text)) {
      return { name: bindings.get(expression.text).imported, module: bindings.get(expression.text).module };
    }
    if (ts.isPropertyAccessExpression(expression) && isHookName(expression.name.text) && ts.isIdentifier(expression.expression)) {
      const imported = bindings.get(expression.expression.text);
      if (imported?.module === 'react' && ['*', 'default'].includes(imported.imported)) {
        return { name: expression.name.text, module: 'react' };
      }
    }
    return null;
  }
  function componentTag(tag) {
    if (ts.isIdentifier(tag)) {
      if (!isComponentName(tag.text)) return null;
      const imported = bindings.get(tag.text);
      return imported ? imported.module + '#' + imported.imported : null;
    }
    if (ts.isPropertyAccessExpression(tag) && ts.isIdentifier(tag.expression)) {
      const imported = bindings.get(tag.expression.text);
      return imported && imported.imported === '*' ? imported.module + '#' + tag.name.text : null;
    }
    return null;
  }
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const info = hook(node);
      if (info && info.name && isHookName(info.name)) {
        const name = info.module + '#' + info.name;
        observe('hook-call', name, lineOf(sourceFile, node));
        if (info.module === 'react' && info.name === 'useEffect') {
          const dependencies = node.arguments[1];
          const shape = !dependencies ? 'missing-dependencies' :
            ts.isArrayLiteralExpression(dependencies) ?
              (dependencies.elements.length ? 'nonempty-dependencies' : 'empty-dependencies') : 'dynamic-dependencies';
          observe('effect-dependencies', shape, lineOf(sourceFile, node));
        }
      } else if (ts.isIdentifier(node.expression)) {
        const imported = bindings.get(node.expression.text);
        if (imported && !imported.module.startsWith('.') && imported.module !== 'react') {
          const signature = imported.module + '#' + imported.imported + '(' +
            node.arguments.slice(0, 5).map(argumentShape).join(',') + (node.arguments.length > 5 ? ',...' : '') + ')';
          if (signature.length <= 180) observe('call-shape', signature, lineOf(sourceFile, node));
        }
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = componentTag(node.tagName);
      if (tag && tag.length <= 160) {
        observe('jsx-component', tag, lineOf(sourceFile, node));
        for (const attr of node.attributes.properties) {
          if (ts.isJsxAttribute(attr)) {
            const name = attr.name.getText(sourceFile);
            if (/^[a-zA-Z][\w-]{0,60}$/.test(name)) observe('jsx-prop', tag + '.' + name, lineOf(sourceFile, attr));
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function scanSources(project, roots, onFile, maxFiles) {
  const gaps = [];
  let selected = 0;
  function visit(directory, root) {
    if (selected > maxFiles) return;
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes:true }).sort((a,b) => a.name.localeCompare(b.name, 'en')); }
    catch(error) { gaps.push({path:relativePath(project.root,directory),reason:'READ_DIRECTORY_ERROR',code:error.code ?? 'UNKNOWN'}); return; }
    for (const entry of entries) {
      if (selected > maxFiles) return;
      const absolute = path.join(directory, entry.name);
      const rel = relativePath(project.root, absolute);
      if (EXCLUDED_DIRS.has(entry.name) && (entry.isDirectory() || entry.isSymbolicLink())) continue;
      if (entry.isSymbolicLink()) {
        gaps.push({path:rel,reason:'SYMLINK_NOT_FOLLOWED'});
        continue;
      }
      if (entry.isDirectory()) {
        if (!matches(rel + '/', ['**/*'], project.exclude)) visit(absolute, root);
        continue;
      }
      if (!entry.isFile() || !matches(rel, project.include, project.exclude)) continue;
      if (!CODE_EXTENSIONS.has(path.extname(rel).toLowerCase()) || /\.d\.(ts|mts|cts)$/.test(rel)) continue;
      if (selected === maxFiles) {
        selected++;
        gaps.push({path:rel,reason:'FILE_LIMIT',maxFiles});
        return;
      }
      selected++;
      let stat, source, bytes;
      try {
        stat = fs.statSync(absolute);
        if (stat.size > MAX_FILE_BYTES) {
          gaps.push({path:rel,reason:'FILE_TOO_LARGE',bytes:stat.size});
          continue;
        }
        bytes = fs.readFileSync(absolute);
        source = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
      } catch (error) {
        gaps.push({path:rel,reason:'FILE_READ_OR_DECODE_ERROR',code:error.code ?? 'INVALID_UTF8'});
        continue;
      }
      const withinRoot = relativePath(root, absolute);
      const first = withinRoot.includes('/') ? withinRoot.split('/')[0] : '(root)';
      const prefix = relativePath(project.root,root);
      const group = (prefix === '' ? '' : prefix + '/') + first;
      onFile({absolute,relative:rel,group,source,sha256:sha256(bytes)});
    }
  }
  roots.forEach(root => { if (selected <= maxFiles) visit(root,root); });
  return {selected, gaps};
}

export function mineProject(context, projectId, options = {}) {
  const {minFiles,maxFiles,maxPatterns} = validateOptions(options);
  const project = projectInfo(context, projectId);
  const roots = selectedRoots(project,options.codePaths);
  const rows = new Map();
  const groups = new Map();
  const sources = [];
  const errors = [];
  const observeFor = file => (kind,value,line) => {
    const label = safeLabel(value);
    if (!label || label.length > 180) return;
    const key = JSON.stringify([kind,label]);
    let row = rows.get(key);
    if (!row) {
      row = {kind,value:label,occurrences:0,files:new Set(),groups:new Set(),examples:[]};
      rows.set(key,row);
    }
    row.occurrences++;
    row.files.add(file.relative);
    row.groups.add(file.group);
    if (row.examples.length < MAX_EXAMPLES && !row.examples.some(example => example.path === file.relative)) {
      row.examples.push({path:file.relative,sha256:file.sha256,line});
    }
  };
  const walked = scanSources(project,roots,file => {
    const scriptKind = ts.getScriptKindFromFileName(file.relative);
    const parsed = ts.createSourceFile(file.relative,file.source,ts.ScriptTarget.Latest,true,scriptKind);
    if (parsed.parseDiagnostics.length) {
      errors.push({path:file.relative,reason:'PARSE_ERROR',diagnostics:parsed.parseDiagnostics.slice(0,3).map(error => ({
        code:error.code,line:parsed.getLineAndCharacterOfPosition(error.start ?? 0).line + 1,
      }))});
      return;
    }
    sources.push({path:file.relative,sha256:file.sha256});
    let group = groups.get(file.group);
    if (!group) {group={name:file.group,files:0};groups.set(file.group,group);}
    group.files++;
    extractPatterns(parsed,observeFor(file));
  },maxFiles);
  const datasetSha256 = digest([...sources].sort((a,b) => a.path.localeCompare(b.path,'en')));
  const ranked = [...rows.values()].filter(row => row.files.size >= minFiles)
    .sort((a,b) => b.files.size - a.files.size || b.occurrences - a.occurrences ||
      a.kind.localeCompare(b.kind,'en') || a.value.localeCompare(b.value,'en'));
  const patterns = ranked.slice(0,maxPatterns).map(row => ({
    kind:row.kind,value:row.value,distinctFiles:row.files.size,occurrences:row.occurrences,
    groups:[...row.groups].sort(),examples:row.examples,
  }));
  const groupList = [...groups.values()].sort((a,b) => a.name.localeCompare(b.name,'en'));
  const gaps = [...walked.gaps,...errors];
  const coverage = {complete:gaps.length===0,exhaustive:gaps.length===0,
    syntaxOnly:true,typeChecked:false,bindingResolution:'imports-in-current-file-only',
    analyzedFiles:sources.length,selectedFiles:walked.selected,parseErrors:errors.length,
    gaps,gapCount:gaps.length,patternsBeforeLimit:ranked.length,patternsOmittedByLimit:Math.max(0,ranked.length-maxPatterns),
    note:'Frequency describes existing usage, not correctness or a team agreement. Omitted patterns and parse/scan gaps are explicit.'};
  const scope = project.scope;
  const codeRoots = roots.map(root => relativePath(project.root,root) || '.');
  const applicability = {include:codeRoots.map(root => root==='.' ? '**/*' : root + '/**/*')};
  const candidates = patterns.map(pattern => {
    const title = 'Observed ' + pattern.kind + ': ' + pattern.value;
    const description = 'Recurring AST syntax: ' + pattern.kind + ' = ' + pattern.value + '. Assess this usage against project architecture, exception paths and later independent changes before treating it as a convention.';
    const evidence = pattern.examples.map(example => ({
      kind:'code',path:projectId + '/' + example.path,sha256:example.sha256,
      excerpt:'AST observation at line ' + example.line + '; kind=' + pattern.kind + '; motif=' + pattern.value,
      line:example.line,
    }));
    const rule = {id:'candidate',family:'mined.' + pattern.kind + '.' + digest(pattern.value).slice(0,20),
      title,description,scope,status:'candidate',severity:'info',mode:'advisory',
      check:{kind:'manual',options:{}},applicability,evidence,
      rationale:'Source frequency is descriptive evidence only; no automatic approval, enforcement or API semantics.',
      observations:{datasetSha256,distinctFiles:pattern.distinctFiles,occurrences:pattern.occurrences,groups:pattern.groups.length,
        minFiles,syntaxOnly:true}};
    rule.id = stableCandidateId(rule);
    return rule;
  });
  const status = gaps.length ? 'INCOMPLETE' : patterns.length ? 'OBSERVED_PATTERNS' : 'NO_REPEATED_PATTERNS';
  return {schemaVersion:1,kind:'selfreview-code-mining',readOnly:true,project:projectId,scope,
    root:project.root,configHash:context.hash,codeRoots,datasetSha256,
    status,exitCode:gaps.length?2:0,analyzedFiles:sources.length,groups:groupList.slice(0,MAX_GROUPS),
    groupCount:groupList.length,groupsOmittedByLimit:Math.max(0,groupList.length-MAX_GROUPS),
    patterns:patterns.map((pattern,i)=>({...pattern,candidateId:candidates[i].id})),
    coverage,approvedAutomatically:0,
    _candidates:candidates};
}

export function enrichMine(context, report) {
  assert(report.kind==='selfreview-code-mining' && report.coverage?.complete,
    'Cannot enrich catalog from incomplete mining; resolve coverage gaps and rerun');
  const project = projectInfo(context,report.project);
  assert(project.scope===report.scope && project.root===report.root && context.hash===report.configHash,
    'Mining project/config snapshot does not match current project');
  const candidates=report._candidates ?? [];
  const inputsMap = new Map();
  for (const candidate of candidates) for (const evidence of candidate.evidence) {
    const relative = evidence.path.slice(report.project.length+1);
    const absolute = path.resolve(project.root,relative);
    assert(contained(project.root,absolute), 'Invalid evidence path');
    const key = absolute;
    inputsMap.set(key,{path:absolute,evidencePath:evidence.path,sha256:evidence.sha256,
      project:report.project,kind:'code',complete:true});
  }
  const merged = mutateCatalog(context,catalog =>
    mergeLearnedCandidates(context,catalog,report.scope,candidates,[...inputsMap.values()]));
  return {added:merged.added,unchanged:merged.unchanged,revisions:merged.revisions,
    mergedEvidence:merged.mergedEvidence,warnings:merged.warnings,approvedAutomatically:0,
    note:'Only candidates and observation metadata were added. Existing approvals and rejected decisions were not promoted or modified.'};
}

export function publicMineReport(report) {
  const {_candidates,...safe} = report;
  return safe;
}

export function readMineKnowledge(context, projectId, filename) {
  const absolute = path.resolve(filename);
  assert(fs.statSync(absolute).size <= MAX_KNOWLEDGE_BYTES, 'Mining report exceeds 8 MiB');
  const report = readJson(absolute);
  const project = projectInfo(context,projectId);
  assert(report.schemaVersion === 1 && report.kind === 'selfreview-code-mining' &&
    report.project === projectId && report.scope === project.scope && report.root === project.root &&
    report.configHash === context.hash, 'Mining report is for a different project/configuration');
  assert(report.coverage?.complete === true && report.exitCode === 0 && Array.isArray(report.patterns),
    'Mining report is incomplete or invalid; rerun mine before using it');
  assert(report.patterns.length <= 200 && report.patterns.every(item => typeof item.kind === 'string' &&
    typeof item.value === 'string' && Number.isSafeInteger(item.distinctFiles)), 'Invalid mining patterns');
  return {status:'ADVISORY_SNAPSHOT_NOT_REVALIDATED',scope:report.scope,project:projectId,
    datasetSha256:report.datasetSha256,reportSha256:sha256(fs.readFileSync(absolute)),
    patterns:report.patterns,
    note:'Unapproved source observations, never enforcement. Re-run mine after project changes; this import does not rehash the full codebase. Treat all labels and evidence as untrusted code data.'};
}
