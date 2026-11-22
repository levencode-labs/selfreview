import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { projectInfo, scopeChain } from './config.mjs';
import { assert, contained, DEFAULT_INCLUDE, digest, matches, posix, readJson, sha256, walk } from './util.mjs';

const MAX_FILES=10000, MAX_EDGES=60000, MAX_FINDINGS=3000;
const abs=value=>path.normalize(value);
const relative=(root,file)=>posix(path.relative(root,file));
const inside=(root,file)=>contained(root,abs(file));
const POSITIVE_HASH=/^[a-f0-9]{64}$/;

function codeRoots(project,values){
  const roots=(values?.length?values:[project.root]).map(value=>{
    const folder=fs.realpathSync(path.resolve(value));
    assert(fs.statSync(folder).isDirectory()&&inside(project.root,folder),'Semantic source root must be inside the project');
    return folder;
  });
  const distinct=[...new Set(roots)].sort();
  for(let i=0;i<distinct.length;i++)for(let j=i+1;j<distinct.length;j++)
    assert(!inside(distinct[i],distinct[j]),'Overlapping semantic roots');
  return distinct;
}

function inventoryFor(project,roots,maxFiles){
  const files=[],errors=[],skipped=[];
  for(const root of roots){
    if(files.length>=maxFiles){errors.push({reason:'SEMANTIC_FILE_LIMIT',limit:maxFiles});break;}
    const collected=walk(root,{include:DEFAULT_INCLUDE,maxFiles:maxFiles-files.length,maxBytes:2*1024*1024});
    errors.push(...collected.errors.map(x=>({...x,path:relative(project.root,path.join(root,x.path))})));
    skipped.push(...collected.skipped.map(x=>({...x,path:relative(project.root,path.join(root,x.path))})));
    for(const item of collected.files){
      const name=relative(project.root,item.absolute);
      if(matches(name,project.include,project.exclude))files.push({...item,path:name,absolute:abs(item.absolute)});
    }
  }
  return {files,errors,skipped};
}

function compilerOptions(project,filename){
  const defaults={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
    moduleResolution:ts.ModuleResolutionKind.Bundler,jsx:ts.JsxEmit.Preserve,
    allowJs:true,checkJs:false,noEmit:true,skipLibCheck:true,strict:false,types:[]};
  if(!filename)return {options:defaults,tsconfig:null,errors:[]};
  const location=fs.realpathSync(path.resolve(filename));
  assert(inside(project.root,location),'tsconfig must be inside the project');
  assert(fs.statSync(location).size<=1024*1024,'tsconfig too large');
  const json=ts.readConfigFile(location,ts.sys.readFile);
  if(json.error)return {options:defaults,tsconfig:location,errors:[{reason:'TSCONFIG_READ_ERROR',code:json.error.code}]};
  // TypeScript reads JSON configuration but project plugins and application code are never executed.
  const parsed=ts.parseJsonConfigFileContent(json.config,ts.sys,path.dirname(location),{},location);
  return {options:{...defaults,...parsed.options,noEmit:true,incremental:false,composite:false,
    declaration:false,emitDeclarationOnly:false,tsBuildInfoFile:undefined,allowJs:true},
    tsconfig:location,errors:parsed.errors.map(x=>({reason:'TSCONFIG_DIAGNOSTIC',code:x.code})).slice(0,100)};
}

function approvedProfile(context,catalog,project,filename){
  if(!filename)return {boundaries:[],topLevels:[],hash:null};
  const location=fs.realpathSync(path.resolve(filename));
  assert(fs.statSync(location).size<=1024*1024,'Semantic profile too large');
  const input=readJson(location);
  assert(input.schemaVersion===1&&input.project===project.id,'Semantic profile project/version mismatch');
  assert(Object.keys(input).every(key=>['schemaVersion','project','boundaryRules','topLevelRules'].includes(key)),
    'Unsupported semantic profile field');
  const allowed=new Map(catalog.rules.filter(rule=>rule.status==='approved'&&
    rule.check.kind==='manual'&&scopeChain(context.config,project.scope).includes(rule.scope))
    .map(rule=>[rule.id,rule]));
  function checked(item,boundary){
    assert(item&&typeof item==='object','Invalid semantic profile rule');
    const keys=boundary?['ruleId','from','to','includeTypeOnly','evidence']:['ruleId','module','evidence'];
    assert(Object.keys(item).every(key=>keys.includes(key)),'Unknown semantic profile rule option');
    const rule=allowed.get(item.ruleId);
    assert(rule,'Semantic policy must reference an approved manual rule: '+item.ruleId);
    assert(item.evidence&&typeof item.evidence.path==='string'&&POSITIVE_HASH.test(item.evidence.sha256),
      'Semantic policy requires pinned evidence');
    const evidence=path.resolve(project.root,item.evidence.path);
    assert(inside(project.root,evidence),'Semantic evidence escapes project root');
    const stat=fs.lstatSync(evidence);
    assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=2*1024*1024,'Semantic evidence unavailable');
    assert(sha256(fs.readFileSync(evidence))===item.evidence.sha256,'Semantic policy evidence changed');
    assert(rule.evidence.some(original=>original.path===item.evidence.path&&
      original.sha256===item.evidence.sha256),
      'Semantic profile evidence is not part of the approved rule');
    const globs=boundary?[item.from,item.to]:[item.module];
    for(const pattern of globs){assert(typeof pattern==='string','Semantic policy glob missing');matches('syntax-validation',[pattern],[]);}
    if(boundary)assert(item.includeTypeOnly===undefined||typeof item.includeTypeOnly==='boolean','Invalid includeTypeOnly');
    return {...item,rule};
  }
  const boundaries=input.boundaryRules??[],tops=input.topLevelRules??[];
  assert(Array.isArray(boundaries)&&boundaries.length<=100&&Array.isArray(tops)&&tops.length<=100,'Semantic rule limit');
  return {boundaries:boundaries.map(x=>checked(x,true)),topLevels:tops.map(x=>checked(x,false)),
    hash:sha256(fs.readFileSync(location))};
}

function compilerHost(options,files,project){
  const sources=new Map(files.map(file=>[abs(file.absolute),file]));
  const base=ts.createCompilerHost(options,true);
  const lib=path.dirname(abs(ts.getDefaultLibFilePath(options)));
  const modules=path.join(project.root,'node_modules');
  const allowed=name=>{
    const file=abs(name);
    return sources.has(file)||(inside(lib,file)&&/\.d\.(ts|mts|cts)$/i.test(file))||
      (inside(modules,file)&&/\.(d\.ts|d\.mts|d\.cts|json)$/i.test(file));
  };
  return {...base,
    fileExists:name=>allowed(name)&&(sources.has(abs(name))||base.fileExists(name)),
    readFile:name=>sources.get(abs(name))?.source??(allowed(name)?base.readFile(name):undefined),
    getSourceFile:(name,version,onError,refresh)=>{
      const captured=sources.get(abs(name));
      if(captured)return ts.createSourceFile(name,captured.source,version,true,ts.getScriptKindFromFileName(name));
      return allowed(name)?base.getSourceFile(name,version,onError,refresh):undefined;
    },
    realpath:name=>{
      try{const real=abs(fs.realpathSync(name));return allowed(real)?real:name;}catch{return name;}
    }};
}

function at(sf,node){
  const start=sf.getLineAndCharacterOfPosition(node.getStart(sf));
  const end=sf.getLineAndCharacterOfPosition(node.getEnd());
  return {startLine:start.line+1,endLine:end.line+1,column:start.character+1,endColumn:end.character+1};
}
function issue(rule,sf,node,file,message,details={}){
  return {ruleId:rule.id,family:rule.family,title:rule.title,severity:rule.severity,mode:rule.mode,
    message,project:file.project,scope:file.scope,path:file.path,sourceHash:file.hash,...at(sf,node),...details};
}
function advice(id,title){
  return {id,family:'semantic.'+id,title,severity:'warning',mode:'advisory'};
}

function reactImports(sf,checker){
  const named=new Map(),namespaces=new Map();
  for(const stmt of sf.statements){
    if(!ts.isImportDeclaration(stmt)||!ts.isStringLiteral(stmt.moduleSpecifier)||stmt.moduleSpecifier.text!=='react')continue;
    const clause=stmt.importClause;
    if(clause?.name)namespaces.set(clause.name.text,checker.getSymbolAtLocation(clause.name));
    const bindings=clause?.namedBindings;
    if(bindings&&ts.isNamespaceImport(bindings))namespaces.set(bindings.name.text,checker.getSymbolAtLocation(bindings.name));
    if(bindings&&ts.isNamedImports(bindings))for(const element of bindings.elements){
      const imported=element.propertyName?.text??element.name.text;
      if(/^use[A-Z]/.test(imported))named.set(element.name.text,{name:imported,symbol:checker.getSymbolAtLocation(element.name)});
    }
  }
  return {named,namespaces};
}
function importedHook(callee,checker,bindings){
  if(ts.isIdentifier(callee)){
    const entry=bindings.named.get(callee.text);
    return entry?.symbol&&checker.getSymbolAtLocation(callee)===entry.symbol?entry.name:null;
  }
  if(ts.isPropertyAccessExpression(callee)&&ts.isIdentifier(callee.expression)&&/^use[A-Z]/.test(callee.name.text)){
    const symbol=bindings.namespaces.get(callee.expression.text);
    return symbol&&checker.getSymbolAtLocation(callee.expression)===symbol?callee.name.text:null;
  }
  return null;
}
function functionLabel(node){
  if(node.name&&ts.isIdentifier(node.name))return node.name.text;
  if(ts.isVariableDeclaration(node.parent)&&ts.isIdentifier(node.parent.name))return node.parent.name.text;
  return null;
}
function hookProblem(call){
  let nested=false,branch=false,loop=false;
  for(let parent=call.parent;parent;parent=parent.parent){
    if(ts.isIfStatement(parent)||ts.isConditionalExpression(parent)||ts.isSwitchStatement(parent))branch=true;
    if(ts.isForStatement(parent)||ts.isForInStatement(parent)||ts.isForOfStatement(parent)||
      ts.isWhileStatement(parent)||ts.isDoStatement(parent))loop=true;
    if(ts.isBinaryExpression(parent)&&[
      ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken].includes(parent.operatorToken.kind))branch=true;
    if(ts.isFunctionLike(parent)){
      const name=functionLabel(parent);
      if(name&&(/^[A-Z]/.test(name)||/^use[A-Z]/.test(name)))
        return nested?'nested-callback':loop?'loop':branch?'conditional':null;
      nested=true;
    }
  }
  return null;
}
function localTypedProps(sf,checker,node,known){
  if(!ts.isIdentifier(node.tagName)||!/^[A-Z]/.test(node.tagName.text))return [];
  if(node.attributes.properties.some(x=>ts.isJsxSpreadAttribute(x)))return [];
  const alias=checker.getSymbolAtLocation(node.tagName);
  if(!alias)return [];
  const symbol=(alias.flags&ts.SymbolFlags.Alias)?checker.getAliasedSymbol(alias):alias;
  if(!symbol?.declarations?.some(decl=>known.has(abs(decl.getSourceFile().fileName))))return [];
  const component=checker.getTypeAtLocation(node.tagName);
  if(component.flags&(ts.TypeFlags.Any|ts.TypeFlags.Unknown|ts.TypeFlags.TypeParameter))return [];
  const signatures=component.getCallSignatures();
  if(signatures.length!==1||signatures[0].typeParameters?.length)return [];
  const parameter=signatures[0].getParameters()[0];
  if(!parameter)return [];
  const props=checker.getTypeOfSymbolAtLocation(parameter,node.tagName);
  if(props.flags&(ts.TypeFlags.Any|ts.TypeFlags.Unknown|ts.TypeFlags.TypeParameter))return [];
  if(checker.getIndexInfoOfType(props,ts.IndexKind.String)||checker.getIndexInfoOfType(props,ts.IndexKind.Number))return [];
  const allowed=new Set(checker.getPropertiesOfType(props).map(x=>x.getName()));
  return node.attributes.properties.filter(attr=>ts.isJsxAttribute(attr)).filter(attr=>{
    const name=attr.name.getText(sf);
    return name!=='key'&&name!=='ref'&&!name.startsWith('data-')&&!name.startsWith('aria-')&&!allowed.has(name);
  });
}
function typeOnlyImport(statement) {
  const clause=statement.importClause;
  if(clause?.isTypeOnly)return true;
  const bindings=clause?.namedBindings;
  return !!bindings&&ts.isNamedImports(bindings)&&bindings.elements.length>0&&
    bindings.elements.every(item=>item.isTypeOnly);
}
function typeOnlyExport(statement) {
  if(statement.isTypeOnly)return true;
  const clause=statement.exportClause;
  return !!clause&&ts.isNamedExports(clause)&&clause.elements.length>0&&
    clause.elements.every(item=>item.isTypeOnly);
}
function topLevelInvocations(sf){
  const nodes=[];
  for(const stmt of sf.statements){
    if(ts.isExpressionStatement(stmt)&&(ts.isCallExpression(stmt.expression)||ts.isNewExpression(stmt.expression)))
      nodes.push(stmt.expression);
    if(ts.isVariableStatement(stmt))for(const variable of stmt.declarationList.declarations)
      if(variable.initializer&&(ts.isCallExpression(variable.initializer)||ts.isNewExpression(variable.initializer)))
        nodes.push(variable.initializer);
  }
  return nodes;
}
function graphCycles(edges){
  const links=new Map(),stack=[],active=new Set(),visited=new Map(),lowest=new Map(),groups=[];let counter=0;
  for(const edge of edges.filter(x=>!x.typeOnly)){
    if(!links.has(edge.from))links.set(edge.from,[]);
    if(!links.has(edge.to))links.set(edge.to,[]);
    links.get(edge.from).push(edge.to);
  }
  function visit(node){
    visited.set(node,counter);lowest.set(node,counter++);stack.push(node);active.add(node);
    for(const to of links.get(node)||[]){
      if(!visited.has(to)){visit(to);lowest.set(node,Math.min(lowest.get(node),lowest.get(to)));}
      else if(active.has(to))lowest.set(node,Math.min(lowest.get(node),visited.get(to)));
    }
    if(lowest.get(node)===visited.get(node)){
      let current;const members=[];
      do{current=stack.pop();active.delete(current);members.push(current);}while(current!==node);
      if(members.length>1)groups.push(members.sort());
    }
  }
  for(const node of links.keys())if(!visited.has(node))visit(node);
  return groups.sort((a,b)=>a[0].localeCompare(b[0])).slice(0,100);
}

export function reviewProjectSemantics(context,catalog,projectId,settings={}){
  const project=projectInfo(context,projectId), maxFiles=settings.maxFiles??4000;
  assert(Number.isSafeInteger(maxFiles)&&maxFiles>0&&maxFiles<=MAX_FILES,'Semantic maxFiles must be 1..10000');
  const roots=codeRoots(project,settings.codePaths), options=compilerOptions(project,settings.tsconfig);
  const policy=approvedProfile(context,catalog,project,settings.profile);
  const inventory=inventoryFor(project,roots,maxFiles);
  const errors=[...inventory.errors,...options.errors,
    ...inventory.skipped.filter(item=>item.reason==='SYMLINK_NOT_FOLLOWED')
      .map(item=>({path:item.path,reason:'SEMANTIC_SOURCE_SYMLINK_NOT_ANALYZED'}))],
    unknown=[],edges=[],findings=[],indicators=[];
  const known=new Map(inventory.files.map(file=>[file.absolute,{...file,project:project.id,scope:project.scope}]));
  const sources=[...known.values()];
  const host=compilerHost(options.options,sources,project);
  const program=ts.createProgram({rootNames:sources.map(file=>file.absolute),options:options.options,host});
  const checker=program.getTypeChecker();
  const diagnostics=program.getSyntacticDiagnostics().concat(program.getSemanticDiagnostics())
    .filter(d=>d.category===ts.DiagnosticCategory.Error);
  for(const diag of diagnostics.slice(0,100)){
    const name=diag.file?.fileName;
    unknown.push({path:name&&inside(project.root,name)?relative(project.root,name):'(typescript)',
      reason:'TYPE_DIAGNOSTIC',code:diag.code});
  }
  if(diagnostics.length>100)errors.push({reason:'TYPE_DIAGNOSTIC_LIMIT',count:diagnostics.length});
  const selected=settings.selectedPaths?new Set(settings.selectedPaths.map(posix)):null;
  const changed=settings.changedRanges??null;
  function included(file,node,sf){
    if(selected&&!selected.has(file.path))return false;
    if(!changed)return true;
    const ranges=changed instanceof Map?changed.get(file.path):changed[file.path];
    if(!ranges)return false;
    const location=at(sf,node);
    return ranges.some(range=>location.startLine<=range.end&&location.endLine>=range.start);
  }
  function add(finding,file,node,sf){
    if(!included(file,node,sf))return;
    if(findings.length>=MAX_FINDINGS){
      if(!errors.some(e=>e.reason==='SEMANTIC_FINDINGS_LIMIT'))errors.push({reason:'SEMANTIC_FINDINGS_LIMIT'});
      return;
    }
    findings.push({...finding,changeRelation:changed?'touches-change':'not-compared'});
  }
  function edge(file,sf,spec,node,kind,typeOnly=false){
    if(typeof spec!=='string'){
      unknown.push({path:file.path,line:at(sf,node).startLine,reason:'DYNAMIC_SPECIFIER',kind});return;
    }
    const resolved=ts.resolveModuleName(spec,file.absolute,options.options,host).resolvedModule?.resolvedFileName;
    if(!resolved){
      if(spec.startsWith('.')||spec.startsWith('@/')||spec.startsWith('~/'))
        unknown.push({path:file.path,line:at(sf,node).startLine,reason:'INTERNAL_IMPORT_UNRESOLVED',specifier:spec});
      return;
    }
    const destination=abs(resolved);
    if(!inside(project.root,destination)||inside(path.join(project.root,'node_modules'),destination))return;
    const target=known.get(destination);
    if(!target){
      unknown.push({path:file.path,line:at(sf,node).startLine,reason:'INTERNAL_IMPORT_OUTSIDE_DOMAIN',
        specifier:spec,target:relative(project.root,destination)});return;
    }
    if(edges.length>=MAX_EDGES){
      if(!errors.some(e=>e.reason==='SEMANTIC_EDGE_LIMIT'))errors.push({reason:'SEMANTIC_EDGE_LIMIT'});return;
    }
    edges.push({from:file.path,to:target.path,specifier:spec,kind,typeOnly,line:at(sf,node).startLine,sourceHash:file.hash,node});
  }

  for(const file of sources){
    const sf=program.getSourceFile(file.absolute);
    if(!sf){errors.push({reason:'SEMANTIC_SOURCE_MISSING',path:file.path});continue;}
    if(sf.parseDiagnostics.length){
      errors.push({reason:'SEMANTIC_PARSE_ERROR',path:file.path,codes:sf.parseDiagnostics.slice(0,3).map(d=>d.code)});
      continue;
    }
    for(const stmt of sf.statements){
      if(ts.isImportDeclaration(stmt)&&ts.isStringLiteral(stmt.moduleSpecifier))
        edge(file,sf,stmt.moduleSpecifier.text,stmt,'import',typeOnlyImport(stmt));
      if(ts.isExportDeclaration(stmt)&&stmt.moduleSpecifier&&ts.isStringLiteral(stmt.moduleSpecifier))
        edge(file,sf,stmt.moduleSpecifier.text,stmt,'re-export',typeOnlyExport(stmt));
    }
    const imports=reactImports(sf,checker);
    function visit(node){
      if(ts.isCallExpression(node)){
        if(ts.isIdentifier(node.expression)&&node.expression.text==='require'){
          const symbol=checker.getSymbolAtLocation(node.expression);
          if(symbol?.declarations?.some(decl=>abs(decl.getSourceFile().fileName)===file.absolute)){
            unknown.push({path:file.path,line:at(sf,node).startLine,reason:'SHADOWED_REQUIRE_UNMODELED'});
          } else {
            const arg=node.arguments[0];
            edge(file,sf,arg&&ts.isStringLiteral(arg)?arg.text:null,node,'require');
          }
        }
        if(node.expression.kind===ts.SyntaxKind.ImportKeyword){
          const arg=node.arguments[0];
          edge(file,sf,arg&&ts.isStringLiteral(arg)?arg.text:null,node,'dynamic-import');
        }
        const hook=importedHook(node.expression,checker,imports);
        if(hook){
          const problem=hookProblem(node);
          if(problem)add(issue(advice('react-hook-placement','React hook placement'),sf,node,file,
            'Imported React hook '+hook+' appears in '+problem+' context.',
            {semanticKind:'react-hook-placement',matchPrecision:'react-import-symbol'}),file,node,sf);
        }
      }
      if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
        for(const invalid of localTypedProps(sf,checker,node,known))
          add(issue(advice('jsx-unknown-prop','Unrecognized typed JSX prop'),sf,invalid,file,
            'JSX property '+invalid.name.getText(sf)+' is not in the statically resolved local component props.',
            {semanticKind:'jsx-unknown-prop',matchPrecision:'local-component-props'}),file,invalid,sf);
      }
      ts.forEachChild(node,visit);
    }
    visit(sf);
    for(const node of topLevelInvocations(sf)){
      if(indicators.length<300)indicators.push({path:file.path,...at(sf,node),kind:'TOP_LEVEL_INVOCATION',
        sourceHash:file.hash,certainty:'POTENTIAL_SIDE_EFFECT_NOT_PROVEN'});
      for(const rule of policy.topLevels){
        if(matches(file.path,[rule.module],[])&&matches(file.path,rule.rule.applicability?.include,rule.rule.applicability?.exclude))
          add(issue(rule.rule,sf,node,file,'A source-backed no-module-invocation policy is violated.',
            {semanticKind:'top-level-invocation',evidenceFile:rule.evidence.path,matchPrecision:'syntax'}),
            file,node,sf);
      }
    }
  }
  for(const item of edges){
    const file=known.get(abs(path.resolve(project.root,item.from)));
    const sf=program.getSourceFile(file.absolute);
    for(const rule of policy.boundaries){
      if(item.typeOnly&&!rule.includeTypeOnly)continue;
      if(!matches(item.from,[rule.from],[])||!matches(item.to,[rule.to],[]))continue;
      if(!matches(item.from,rule.rule.applicability?.include,rule.rule.applicability?.exclude))continue;
      add(issue(rule.rule,sf,item.node,file,'Source-backed architecture rule forbids this dependency: '+
        item.from+' -> '+item.to,
        {semanticKind:'architecture-boundary',dependency:{from:item.from,to:item.to,kind:item.kind,typeOnly:item.typeOnly},
          evidenceFile:rule.evidence.path,matchPrecision:'resolved-internal-edge'}),file,item.node,sf);
    }
  }
  for(const file of sources){
    try{if(sha256(fs.readFileSync(file.absolute))!==file.hash)
      errors.push({reason:'SEMANTIC_SOURCE_DRIFT',path:file.path});}
    catch(error){errors.push({reason:'SEMANTIC_SOURCE_UNAVAILABLE',path:file.path,code:error.code??'UNKNOWN'});}
  }
  if(settings.staged)errors.push({reason:'SEMANTIC_STAGED_UNSUPPORTED',
    message:'The type program is not bound to a complete staged index snapshot.'});
  if(settings.newOnly)errors.push({reason:'SEMANTIC_NEW_ONLY_UNPROVEN',
    message:'Semantic base/target equivalence has not been demonstrated; only touched nodes are shown.'});
  if(unknown.some(item=>['INTERNAL_IMPORT_UNRESOLVED','INTERNAL_IMPORT_OUTSIDE_DOMAIN'].includes(item.reason)))
    errors.push({reason:'SEMANTIC_GRAPH_PARTIAL'});
  if(diagnostics.length)errors.push({reason:'SEMANTIC_TYPES_PARTIAL',count:diagnostics.length});
  const cycles=graphCycles(edges);
  findings.sort((a,b)=>a.path.localeCompare(b.path)||a.startLine-b.startLine||a.ruleId.localeCompare(b.ruleId));
  const focus=selected?[...selected].filter(item=>sources.some(file=>file.path===item)):sources.map(file=>file.path);
  return {schemaVersion:1,kind:'selfreview-semantic-review',project:project.id,scope:project.scope,readOnly:true,
    status:errors.length?'INCOMPLETE':focus.length===0?'NOT_APPLICABLE':findings.length?'SEMANTIC_FINDINGS':'SEMANTIC_CHECKS_COMPLETE',
    exitCode:errors.length?2:findings.some(f=>f.mode==='enforce'&&f.severity==='error')?1:0,
    authority:'BOUNDED_TYPESCRIPT_PROGRAM_WITH_INTERNAL_IMPORT_GRAPH',
    sourceRoots:roots.map(root=>relative(project.root,root)||'.'),tsconfig:options.tsconfig,profileHash:policy.hash,
    sourceDigest:digest(sources.map(file=>({path:file.path,hash:file.hash})).sort((a,b)=>a.path.localeCompare(b.path))),
    coverage:{complete:errors.length===0,sourceFiles:sources.length,focusFiles:focus.length,
      semanticDiagnostics:diagnostics.length,graphEdges:edges.length,graphCycles:cycles.length,
      unresolved:unknown.length,readOnly:true,noProjectExecution:true,
      fullProjectTypeCheck:errors.length===0&&roots.length===1&&roots[0]===project.root,
      newOnlyProven:false},
    graph:{edges:edges.slice(0,1000).map(({node,...rest})=>rest),omittedEdges:Math.max(0,edges.length-1000),
      cycles,unknown:unknown.slice(0,100),unknownOmitted:Math.max(0,unknown.length-100)},
    sideEffects:{topLevelInvocations:indicators,certainty:'POTENTIAL_ONLY_UNLESS_EXPLICIT_APPROVED_SYNTAX_POLICY'},
    findings,errors,skipped:inventory.skipped,
    limitations:['React hook checks require direct symbol-checked react imports; unknown re-export chains are not treated as violations.',
      'Typed JSX props require one unambiguous local call signature without spread or index signatures.',
      'A top-level call does not prove runtime side effects. Approved policies can forbid syntactic invocations.',
      'Internal graph is bounded; unresolved or excluded dependencies produce UNKNOWN, not inferred rule violations.',
      settings.newOnly?'Semantic new-only attribution is unsupported and status is INCOMPLETE.':
        'Changed-line findings intersect changed syntax; they are not proven newly introduced.']};
}
