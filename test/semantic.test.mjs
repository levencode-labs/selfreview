import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadCatalog } from '../src/config.mjs';
import { reviewProjectSemantics } from '../src/semantic.mjs';
import { reviewProject } from '../src/review.mjs';
import { approveRule } from '../src/rules.mjs';
import { sha256, writeJson } from '../src/util.mjs';

function fixture(t) {
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'selfreview-p2-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const root=path.join(home,'billy'),modern=path.join(root,'react-apps','modern');
  const legacy=path.join(root,'react-apps','legacy');
  for(const folder of [modern,legacy,path.join(root,'node_modules','react'),path.join(root,'docs')])
    fs.mkdirSync(folder,{recursive:true});
  function put(name,content) {
    const file=path.join(root,name);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,content);
    return file;
  }
  put('node_modules/react/index.d.ts',
    'export declare function useEffect(callback: () => void, deps?: unknown[]): void;\n'+
    'export declare function useState<T>(initial: T): [T, (next: T) => void];\n'+
    'declare global { namespace JSX { interface IntrinsicElements { div: any; span: any; } } }\n');
  put('node_modules/react/package.json','{"name":"react","types":"index.d.ts","version":"1.0.0"}');
  put('react-apps/modern/Button.tsx',
    'export function Button(props: { label: string; disabled?: boolean }) { return <div>{props.label}</div>; }\n');
  put('react-apps/legacy/Legacy.tsx',
    'export function Legacy() { return <div>legacy</div>; }\n'+
    'export interface LegacyType { id: string }\n');
  const good=put('react-apps/modern/Good.tsx',
    "import { useEffect as effect } from 'react';\n"+
    "import { Button } from './Button';\n"+
    "import type { LegacyType } from '../legacy/Legacy';\n"+
    "export function Good(props: { flag: boolean }) {\n"+
    "  effect(() => {}, []);\n"+
    "  return <Button label=\"ok\" />;\n"+
    "}\n");
  const bad=put('react-apps/modern/Bad.tsx',
    "import { useEffect as effect } from 'react';\n"+
    "import { Button } from './Button';\n"+
    "import { Legacy } from '../legacy/Legacy';\n"+
    "export function Bad(props: { flag: boolean }) {\n"+
    "  if (props.flag) effect(() => {}, []);\n"+
    "  return <Button label=\"ok\" />;\n"+
    "}\n");
  const config=path.join(home,'selfreview.config.json');
  writeJson(config,{schemaVersion:1,catalog:'.selfreview/catalog.json',bestPractices:false,
    scopes:[{id:'web',extends:[],disabledRules:[]}],projects:[{id:'billy',root:'billy',scope:'web'}]});
  writeJson(path.join(home,'.selfreview','catalog.json'),{schemaVersion:1,rules:[]});
  const context=loadConfig(config);
  return {home,root,modern,legacy,good,bad,config,context,put};
}
const opts=f=>({codePaths:[path.join(f.root,'react-apps')],maxFiles:100});
function run(f,extra={}){return reviewProjectSemantics(f.context,loadCatalog(f.context),'billy',{...opts(f),...extra});}
function rule(f,id,title){
  const evidence={kind:'document',path:'docs/policy.md',sha256:sha256('policy')};
  return approveRule({id,family:id,scope:'web',title,description:title,status:'candidate',
    severity:'error',mode:'enforce',check:{kind:'manual',options:{}},evidence:[evidence]},
  'Team','Confirmed team policy');
}
function withPolicy(f,{boundaries=[],topLevels=[]}={}){
  f.put('docs/policy.md','policy');
  const catalog=loadCatalog(f.context);
  catalog.rules.push(rule(f,'arch-boundary','Do not import legacy into modern'));
  catalog.rules.push(rule(f,'no-init','No top-level initialization in UI'));
  writeJson(f.context.catalogPath,catalog);
  const profile=path.join(f.home,'semantic-profile.json');
  const evidence={path:'docs/policy.md',sha256:sha256('policy')};
  writeJson(profile,{schemaVersion:1,project:'billy',
    boundaryRules:boundaries.map(row=>({ruleId:'arch-boundary',evidence,...row})),
    topLevelRules:topLevels.map(row=>({ruleId:'no-init',evidence,...row}))});
  return profile;
}
test('type-aware source graph preserves type-only edge and reports real React hook nesting',t=>{
  const f=fixture(t);
  const result=run(f);
  assert.equal(result.coverage.sourceFiles,4);
  const typeOnly=result.graph.edges.find(edge=>edge.from.endsWith('/Good.tsx')&&edge.to.endsWith('/Legacy.tsx'));
  assert.equal(typeOnly.typeOnly,true);
  assert.ok(result.graph.edges.find(edge=>edge.from.endsWith('/Bad.tsx')&&edge.to.endsWith('/Legacy.tsx')&&!edge.typeOnly));
  assert.ok(result.findings.some(x=>x.semanticKind==='react-hook-placement'&&x.path.endsWith('/Bad.tsx')));
  assert.equal(result.findings.some(x=>x.path.endsWith('/Good.tsx')),false);
  assert.equal(result.coverage.noProjectExecution,true);
});

test('architecture enforcement requires approved manual policy and pinned source evidence',t=>{
  const f=fixture(t);
  assert.equal(run(f).findings.some(x=>x.semanticKind==='architecture-boundary'),false);
  const profile=withPolicy(f,{boundaries:[{from:'react-apps/modern/**/*',to:'react-apps/legacy/**/*'}]});
  const result=run(f,{profile});
  const arch=result.findings.filter(item=>item.semanticKind==='architecture-boundary');
  assert.equal(arch.length,1);
  assert.equal(arch[0].path,'react-apps/modern/Bad.tsx');
  assert.equal(arch[0].mode,'enforce');
  assert.equal(result.exitCode,1);
  f.put('docs/policy.md','changed');
  assert.throws(()=>run(f,{profile}),/evidence changed/);
});

test('type-only architecture edges never enforce unless policy explicitly includes them',t=>{
  const f=fixture(t);
  const profile=withPolicy(f,{boundaries:[{from:'react-apps/modern/**/*',to:'react-apps/legacy/**/*',includeTypeOnly:true}]});
  const result=run(f,{profile});
  assert.equal(result.findings.filter(x=>x.semanticKind==='architecture-boundary').length,2);
});

test('top-level call is advisory potential until explicit source-backed policy',t=>{
  const f=fixture(t);
  f.put('react-apps/modern/Startup.ts','initialize();');
  let result=run(f);
  assert.equal(result.sideEffects.topLevelInvocations.length,1);
  assert.equal(result.findings.some(x=>x.semanticKind==='top-level-invocation'),false);
  const profile=withPolicy(f,{topLevels:[{module:'react-apps/modern/**/*'}]});
  result=run(f,{profile});
  assert.equal(result.findings.filter(x=>x.semanticKind==='top-level-invocation').length,1);
});

test('negative controls: local shadowing, ordinary callback and JSX spread do not fabricate typed findings',t=>{
  const f=fixture(t);
  f.put('react-apps/modern/Shadows.tsx',
    "import { useEffect as effect } from 'react';\n"+
    "import { Button } from './Button';\n"+
    "export function Shadows() {\n"+
    "  const effect = (callback: () => void) => callback();\n"+
    "  if (true) effect(() => {});\n"+
    "  const props = { label: 'ok', extra: 1 };\n"+
    "  return <Button {...props} />;\n"+
    "}\n");
  const result=run(f);
  assert.equal(result.findings.some(x=>x.path.endsWith('/Shadows.tsx')),false);
});

test('typed JSX unknown prop is differentiated from explicit supported props',t=>{
  const f=fixture(t);
  f.put('react-apps/modern/Props.tsx',
    "import { Button } from './Button';\n"+
    "export function Props() { return <Button label=\"ok\" misspelled=\"bad\" />; }\n");
  const result=run(f);
  assert.ok(result.findings.some(x=>x.semanticKind==='jsx-unknown-prop'&&x.path.endsWith('/Props.tsx')));
  assert.equal(result.findings.some(x=>x.semanticKind==='jsx-unknown-prop'&&x.path.endsWith('/Good.tsx')),false);
  assert.ok(result.coverage.semanticDiagnostics>0);
  assert.equal(result.status,'INCOMPLETE','type diagnostics are an explicit completeness boundary');
});

test('unresolved local import and truncated source graph are UNKNOWN, never clean',t=>{
  const f=fixture(t);
  f.put('react-apps/modern/Missing.ts',"import './NotPresent'; export const value = 1;");
  const result=run(f);
  assert.equal(result.status,'INCOMPLETE');
  assert.ok(result.graph.unknown.some(x=>x.reason==='INTERNAL_IMPORT_UNRESOLVED'));
  assert.ok(result.errors.some(x=>x.reason==='SEMANTIC_GRAPH_PARTIAL'));
  assert.equal(run(f,{maxFiles:1}).status,'INCOMPLETE');
});

test('changed-line selection suppresses unaffected findings and new-only refuses unproven semantics',t=>{
  const f=fixture(t);
  let result=run(f,{selectedPaths:['react-apps/modern/Good.tsx']});
  assert.equal(result.findings.length,0);
  result=run(f,{selectedPaths:['react-apps/modern/Bad.tsx'],
    changedRanges:new Map([['react-apps/modern/Bad.tsx',[{start:7,end:7}]]])});
  assert.equal(result.findings.length,0);
  result=run(f,{selectedPaths:['react-apps/modern/Bad.tsx'],
    changedRanges:new Map([['react-apps/modern/Bad.tsx',[{start:5,end:5}]]])});
  assert.ok(result.findings.some(x=>x.semanticKind==='react-hook-placement'));
  assert.equal(run(f,{newOnly:true}).status,'INCOMPLETE');
});

test('CLI standalone semantic report and diff-aware review are distinct surfaces',t=>{
  const f=fixture(t);
  const cli=fileURLToPath(new URL('../bin/selfreview.mjs',import.meta.url));
  const report=path.join(f.home,'semantic.json');
  const p=spawnSync(process.execPath,[cli,'semantic','--config',f.config,'--project','billy',
    '--code',path.join(f.root,'react-apps'),'--out',report],{encoding:'utf8',timeout:30000});
  assert.equal(p.status,0,p.stderr);
  const reportData=JSON.parse(fs.readFileSync(report,'utf8'));
  assert.equal(reportData.kind,'selfreview-semantic-review');
  const diff="diff --git a/react-apps/modern/Bad.tsx b/react-apps/modern/Bad.tsx\n"+
    "--- a/react-apps/modern/Bad.tsx\n+++ b/react-apps/modern/Bad.tsx\n"+
    "@@ -5 +5 @@\n-  if (false) effect(() => {}, []);\n+  if (props.flag) effect(() => {}, []);\n";
  const before=reviewProject(f.context,loadCatalog(f.context),'billy',{diffText:diff});
  const after=reviewProject(f.context,loadCatalog(f.context),'billy',{diffText:diff,semantic:opts(f)});
  assert.equal(before.semantic,undefined);
  assert.ok(after.semantic);
  assert.equal(after.authority,'STATIC_SYNTAX_AND_OPT_IN_SEMANTIC');
  assert.ok(after.findings.some(x=>x.semanticKind==='react-hook-placement'));
});
