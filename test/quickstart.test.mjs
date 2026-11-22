import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson } from '../src/util.mjs';

const cli=fileURLToPath(new URL('../bin/selfreview.mjs',import.meta.url));
function fixture(t){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'selfreview-quickstart-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const root=path.join(temp,'billy'),react=path.join(root,'react-apps'),data=path.join(temp,'my-reports');
  fs.mkdirSync(react,{recursive:true});
  fs.writeFileSync(path.join(react,'package.json'),JSON.stringify({
    name:'@billy/sample-react-app',private:true,
    dependencies:{react:'^18.3.1','react-dom':'^18.3.1'},
  }));
  for(let i=0;i<3;i++)fs.writeFileSync(path.join(react,'Component'+i+'.tsx'),
    "import { Button } from '@team/ui';\n"+
    "export const Widget"+i+" = () => <Button variant=\"solid\" />;\n");
  return {root,react,data};
}
function invoke(f,args=[]){
  return spawnSync(process.execPath,[cli,'quickstart','--project-path',f.root,...(args.includes('--data-dir')?[]:['--data-dir',f.data]),...args],
    {encoding:'utf8',timeout:30000});
}
test('quickstart bootstraps once, mines react-apps and preserves catalog on repeated runs',t=>{
  const f=fixture(t);
  let r=invoke(f);
  assert.equal(r.status,0,r.stderr||r.stdout);
  const first=JSON.parse(r.stdout);
  assert.equal(first.configCreated,true);
  assert.equal(first.mining.analyzedFiles,3);
  assert.equal(first.mining.patternCount>0,true);
  assert.deepEqual(first.codeRoots,[f.react]);
  assert.ok(fs.existsSync(first.mining.report));
  const catalog=path.join(f.data,'.selfreview','catalog.json');
  assert.equal(readJson(catalog).rules.length,0,'default is read only with no candidate import');
  r=invoke(f,['--enrich']);
  assert.equal(r.status,0,r.stderr||r.stdout);
  const second=JSON.parse(r.stdout);
  assert.equal(second.configCreated,false);
  assert.equal(second.existingPolicyPreserved,true);
  assert.ok(second.enrichment.added.length>0);
  const before=fs.readFileSync(catalog,'utf8');
  r=invoke(f,['--enrich']);
  assert.equal(r.status,0,r.stderr||r.stdout);
  assert.deepEqual(JSON.parse(r.stdout).enrichment.added,[]);
  assert.equal(readJson(catalog).rules.length,JSON.parse(before).rules.length);
});
test('quickstart rejects output inside project and invalid source paths without touching target',t=>{
  const f=fixture(t);
  let r=invoke(f,['--data-dir',path.join(f.root,'private')]);
  assert.equal(r.status,2);
  assert.match(r.stderr,/outside/);
  const other=path.join(f.data,'outsider');
  fs.mkdirSync(other,{recursive:true});
  r=invoke(f,['--source-path',other]);
  assert.equal(r.status,2);
  assert.match(r.stderr,/under --project-path/);
  assert.equal(fs.readdirSync(f.root).length,1);
});
test('quickstart refuses to replace an existing catalog missing its configuration',t=>{
  const f=fixture(t);
  const loc=path.join(f.data,'.selfreview');
  fs.mkdirSync(loc,{recursive:true});
  writeJson(path.join(loc,'catalog.json'),{schemaVersion:1,rules:[{id:'important'}]});
  const r=invoke(f);
  assert.equal(r.status,2);
  assert.match(r.stderr,/catalog was found without its config/);
  assert.equal(readJson(path.join(loc,'catalog.json')).rules.length,1);
});
test('source filename omission never makes full project fallback look like a complete react-apps scan',t=>{
  const f=fixture(t);
  fs.renameSync(f.react,path.join(f.root,'application-code'));
  fs.unlinkSync(path.join(f.root,'application-code','package.json'));
  const r=invoke(f,['--enrich','--semantic']);
  assert.equal(r.status,2,r.stderr);
  const report=JSON.parse(r.stdout);
  assert.deepEqual(report.codeRoots,[]);
  assert.equal(report.status,'SOURCE_ROOT_UNCERTAIN');
  assert.equal(report.sourceDiscovery.status,'NO_REACT_PACKAGES');
  assert.equal(report.mining.status,'NOT_RUN_UNVERIFIED_ROOTS');
  assert.equal(report.enrichment.status,'NOT_APPLIED_UNVERIFIED_ROOTS');
  assert.equal(report.semantic.status,'NOT_RUN_UNVERIFIED_ROOTS');
  assert.equal(fs.existsSync(path.join(f.data,'react-apps.mine.json')),false);
});
