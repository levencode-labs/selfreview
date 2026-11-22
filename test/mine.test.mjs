import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadCatalog } from '../src/config.mjs';
import { mineProject, enrichMine, publicMineReport, readMineKnowledge } from '../src/mine.mjs';
import { approveRule } from '../src/rules.mjs';
import { writeJson, sha256 } from '../src/util.mjs';

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'selfreview-mine-'));
  t.after(() => fs.rmSync(temp, {recursive:true,force:true}));
  const root = path.join(temp,'bily');
  const apps = path.join(root,'react-apps');
  fs.mkdirSync(apps,{recursive:true});
  for(let i=0;i<6;i++){
    const folder = path.join(apps,i<3?'app-one':'app-two');
    fs.mkdirSync(folder,{recursive:true});
    fs.writeFileSync(path.join(folder,'Component'+i+'.tsx'),
      "import { useEffect } from 'react';\n" +
      "import { Button } from '@team/ui';\n" +
      "export const Widget"+i+" = () => {\n" +
      "  useEffect(() => { /* passive AST only */ }, []);\n" +
      "  return <Button variant=\"solid\" title=\"ok\" />;\n" +
      "};\n");
  }
  const ignored=path.join(apps,'node_modules','package');
  fs.mkdirSync(ignored,{recursive:true});
  fs.writeFileSync(path.join(ignored,'Ignored.tsx'),'this is invalid <> syntax');
  fs.writeFileSync(path.join(apps,'Declarations.d.ts'),'export declare const arbitrary: string;');
  const configPath=path.join(temp,'selfreview.config.json');
  writeJson(configPath,{schemaVersion:1,catalog:'.selfreview/catalog.json',bestPractices:false,
    scopes:[{id:'web',extends:[],disabledRules:[]}],
    projects:[{id:'bily',root:'bily',scope:'web'}]});
  writeJson(path.join(temp,'.selfreview','catalog.json'),{schemaVersion:1,rules:[]});
  return {temp,root,apps,configPath,context:loadConfig(configPath)};
}
function run(f,options={}){
  return mineProject(f.context,'bily',{codePaths:[f.apps],minFiles:3,...options});
}

test('mines React imports, hooks, JSX usage, props and component style from several apps', t=>{
  const f=fixture(t);
  const report=run(f);
  assert.equal(report.status,'OBSERVED_PATTERNS');
  assert.equal(report.coverage.complete,true);
  assert.equal(report.analyzedFiles,6);
  assert.equal(report.groupCount,2);
  const find=(kind,value)=>report.patterns.find(p=>p.kind===kind&&p.value===value);
  assert.equal(find('import-source','@team/ui').distinctFiles,6);
  assert.equal(find('hook-call','react#useEffect').distinctFiles,6);
  assert.equal(find('effect-dependencies','empty-dependencies').distinctFiles,6);
  assert.equal(find('jsx-component','@team/ui#Button').distinctFiles,6);
  assert.equal(find('jsx-prop','@team/ui#Button.variant').distinctFiles,6);
  assert.equal(find('component-style','function-expression-or-arrow').distinctFiles,6);
  assert.ok(report.patterns.every(p=>p.examples.every(e=>
    e.path.startsWith('react-apps/') && /^[a-f0-9]{64}$/.test(e.sha256))));
  assert.deepEqual(publicMineReport(report),publicMineReport(run(f)));
  assert.equal(publicMineReport(report)._candidates,undefined);
  assert.equal(loadCatalog(f.context).rules.length,0,'read-only mining never mutates catalog');
});

test('repeated mining adds candidates only, retains existing approved rule bytes, and deduplicates',t=>{
  const f=fixture(t), catalogPath=f.context.catalogPath;
  const rule=approveRule({id:'existing-no-console',family:'no-console',scope:'web',
    title:'Existing approved policy',description:'Approved before mining',
    status:'candidate',severity:'error',mode:'enforce',check:{kind:'no-console',options:{}},
    evidence:[{kind:'document',path:'local-policy.md',sha256:sha256('policy')}]},
    'Team','Explicit existing policy');
  writeJson(catalogPath,{schemaVersion:1,rules:[rule]});
  const before=JSON.stringify(loadCatalog(f.context).rules[0]);
  const first=enrichMine(f.context,run(f));
  assert.ok(first.added.length >= 5);
  assert.equal(first.approvedAutomatically,0);
  let catalog=loadCatalog(f.context);
  assert.equal(JSON.stringify(catalog.rules.find(r=>r.id===rule.id)),before);
  assert.ok(catalog.rules.filter(r=>r.id!==rule.id).every(r=>
    r.status==='candidate' && r.check.kind==='manual' && r.mode==='advisory'));
  const second=enrichMine(f.context,run(f));
  catalog=loadCatalog(f.context);
  assert.deepEqual(second.added,[]);
  assert.equal(JSON.stringify(catalog.rules.find(r=>r.id===rule.id)),before);
  assert.equal(catalog.rules.length,first.added.length+1);
});

test('parse failures do not produce findings from malformed files and block enrichment',t=>{
  const f=fixture(t);
  const bad=path.join(f.apps,'app-one','Malformed.tsx');
  fs.writeFileSync(bad,'export const Broken = (=> <div />');
  const result=run(f);
  assert.equal(result.status,'INCOMPLETE');
  assert.equal(result.exitCode,2);
  assert.equal(result.coverage.parseErrors,1);
  assert.ok(result.coverage.gaps.some(g=>g.path.endsWith('Malformed.tsx')&&g.reason==='PARSE_ERROR'));
  assert.throws(()=>enrichMine(f.context,result),/incomplete mining/);
  assert.equal(loadCatalog(f.context).rules.length,0);
});

test('max file cap is explicit and never silently accepts incomplete coverage',t=>{
  const f=fixture(t);
  const result=run(f,{maxFiles:2,minFiles:2});
  assert.equal(result.coverage.complete,false);
  assert.equal(result.exitCode,2);
  assert.ok(result.coverage.gaps.some(g=>g.reason==='FILE_LIMIT'));
  assert.throws(()=>enrichMine(f.context,result),/incomplete mining/);
});

test('code roots must be owned by explicitly selected project',t=>{
  const f=fixture(t);
  const outside=path.join(f.temp,'outside');
  fs.mkdirSync(outside);
  assert.throws(()=>mineProject(f.context,'bily',{codePaths:[outside]}),/outside the selected project/);
  assert.throws(()=>mineProject(f.context,'bily',{codePaths:[f.root,f.apps]}),/Overlapping/);
});

test('agent knowledge preserves trust boundary and rejects mismatched/incomplete snapshots',t=>{
  const f=fixture(t);
  const report=run(f);
  const file=path.join(f.temp,'mine.json');
  writeJson(file,publicMineReport(report));
  const knowledge=readMineKnowledge(f.context,'bily',file);
  assert.equal(knowledge.status,'ADVISORY_SNAPSHOT_NOT_REVALIDATED');
  assert.equal(knowledge.datasetSha256,report.datasetSha256);
  assert.equal(knowledge.patterns.length,report.patterns.length);
  writeJson(file,{...publicMineReport(report),scope:'other'});
  assert.throws(()=>readMineKnowledge(f.context,'bily',file),/different project/);
  writeJson(file,publicMineReport(run(f,{maxFiles:2})));
  assert.throws(()=>readMineKnowledge(f.context,'bily',file),/incomplete/);
});

test('import binding evidence is syntax-only, and no project module code is ever executed',t=>{
  const f=fixture(t);
  const extra=path.join(f.apps,'app-one','Danger.tsx');
  fs.writeFileSync(extra,
    "import { useState as useLocal } from 'react';\n" +
    "import { Button as X } from '@team/ui';\n" +
    "throw new Error('PROJECT_CODE_EXECUTED');\n" +
    "const value = useLocal(0); const element = <X disabled />;\n");
  const report=run(f);
  assert.equal(report.coverage.complete,true);
  assert.equal(report.analyzedFiles,7);
  assert.equal(report.patterns.some(row=>row.value.includes('PROJECT_CODE_EXECUTED')),false);
  assert.ok(report.datasetSha256);
});

test('changed evidence after mining is not imported as a fresh rule',t=>{
  const f=fixture(t);
  const report=run(f);
  fs.appendFileSync(path.join(f.apps,'app-one','Component0.tsx'),'\n// drift\n');
  assert.throws(()=>enrichMine(f.context,report),/MINING_SOURCE_CHANGED/);
  assert.equal(loadCatalog(f.context).rules.length,0);
});

test('CLI mine, enrich and agent-pack --knowledge round-trip on real temp files',t=>{
  const f=fixture(t);
  const cli=fileURLToPath(new URL('../bin/selfreview.mjs',import.meta.url));
  const report=path.join(f.temp,'mine.json');
  const enriched=path.join(f.temp,'enriched.json');
  const pack=path.join(f.temp,'pack.json');
  function cmd(args) {
    const result=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:30000});
    assert.equal(result.status,0,result.stderr || result.stdout);
  }
  const base=['--config',f.configPath,'--project','bily'];
  const scan=['mine',...base,'--code',f.apps,'--min-files','3'];
  cmd([...scan,'--out',report]);
  assert.equal(JSON.parse(fs.readFileSync(report,'utf8')).status,'OBSERVED_PATTERNS');
  assert.equal(loadCatalog(f.context).rules.length,0);
  cmd([...scan,'--enrich','--out',enriched]);
  const outcome=JSON.parse(fs.readFileSync(enriched,'utf8'));
  assert.ok(outcome.enrichment.added.length>0);
  cmd(['agent-pack',...base,'--knowledge',report,'--out',pack]);
  const payload=JSON.parse(fs.readFileSync(pack,'utf8'));
  assert.equal(payload.minedKnowledge.status,'ADVISORY_SNAPSHOT_NOT_REVALIDATED');
  assert.ok(payload.candidateQuestions);
  assert.equal(payload.minedKnowledge.datasetSha256,outcome.datasetSha256);
});
