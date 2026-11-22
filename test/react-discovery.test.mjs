import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discoverReactPackages } from '../src/react-discovery.mjs';

const cli=fileURLToPath(new URL('../bin/selfreview.mjs',import.meta.url));
function fixture(t) {
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'selfreview-recursive-discovery-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const root=path.join(home,'billy'), data=path.join(home,'reports');
  fs.mkdirSync(root,{recursive:true});
  function put(name,content){
    const file=path.join(root,...name.split('/'));
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,content);return file;
  }
  function manifest(dir,dependencies,name='fixture'){
    return put(dir+'/package.json',JSON.stringify({name,dependencies}));
  }
  return {home,root,data,put,manifest};
}
function quick(f,...args){
  return spawnSync(process.execPath,[cli,'quickstart','--project-path',f.root,'--data-dir',f.data,...args],
    {encoding:'utf8',timeout:45000});
}
test('recursively finds React projects beyond depth three using package.json evidence',t=>{
  const f=fixture(t);
  f.manifest('Web/Platform/Products/Marketing/ReactApp',{react:'^18.2.0','react-dom':'^18'});
  f.manifest('Apps/Shop/Clients/Portal/WebClient',{'@vitejs/plugin-react':'^4.0.0'});
  f.manifest('Web/Server',{express:'^5.0.0'});
  f.put('Web/Platform/Products/Marketing/ReactApp/src/App.tsx',
    "import {Button} from '@team/ui'; export const App = () => <Button />;\n");
  f.put('Apps/Shop/Clients/Portal/WebClient/pages/Page.tsx',
    "import {Button} from '@team/ui'; export const Page = () => <Button />;\n");
  f.put('frontend-tasks/templates/tsFull/Container.tsx','export const <> = missing');
  f.put('.nx/cache/1/outputs/index.js','garbled !!!');
  f.manifest('.nx/cache/1/react-demo',{react:'1.0.0'});
  f.manifest('node_modules/react',{react:'1.0.0'});
  f.put('.yarn/releases/yarn-4.0.0.cjs','x'.repeat(2*1024*1024+1));
  f.put('Web/Server/bin/Debug/net10.0/Content/assets/bundle.js','x'.repeat(2*1024*1024+1));

  const discovery=discoverReactPackages(f.root);
  assert.equal(discovery.status,'FOUND_REACT_PACKAGES');
  assert.equal(discovery.coverage.complete,true);
  assert.equal(discovery.reactPackagesMatched,2);
  assert.equal(discovery.reactPackagesSelected,2);
  assert.equal(discovery.packageJsonScanned,3);
  assert.ok(discovery.skippedGeneratedDirectories>=3);
  assert.deepEqual(discovery.matches.map(item=>item.path).sort(),[
    'Apps/Shop/Clients/Portal/WebClient',
    'Web/Platform/Products/Marketing/ReactApp',
  ]);
  assert.ok(discovery.matches.every(item=>item.evidence.kind==='package.json' &&
    /^[a-f0-9]{64}$/.test(item.evidence.sha256) && item.evidence.reactMarkers.length>0));

  const run=quick(f);
  assert.equal(run.status,0,run.stderr||run.stdout);
  const result=JSON.parse(run.stdout);
  assert.equal(result.sourceDiscovery.mode,'RECURSIVE_PACKAGE_JSON');
  assert.equal(result.mining.analyzedFiles,2);
  assert.equal(result.mining.coverage.complete,true);
  assert.equal(result.status,'READY');
  assert.equal(result.codeRoots.length,2);
  assert.equal(result.mining.coverage.gapCount,0);
  assert.equal(fs.existsSync(path.join(f.root,'selfreview.config.json')),false);
  assert.equal(fs.existsSync(path.join(f.root,'.selfreview')),false);
});
test('a React workspace root does not cause a scan of the entire polyglot monorepo',t=>{
  const f=fixture(t);
  f.manifest('.',{react:'^18.0.0'});
  f.manifest('Web/Services/Backend',{express:'^5.0.0'});
  f.manifest('Web/Deep/UI/Marketing/Portal',{next:'^15.0.0'});
  f.put('Web/Deep/UI/Marketing/Portal/src/page.tsx','export const Page=()=> <div/>;\n');
  f.put('frontend-tasks/templates/tsFull/index.ts','<<<invalid template>>>');
  const report=discoverReactPackages(f.root);
  assert.equal(report.reactPackagesMatched,2);
  assert.equal(report.reactPackagesSelected,1);
  assert.ok(report.omitted.some(item=>item.path==='.'&&item.reason==='WORKSPACE_ROOT_NOT_AUTO_SELECTED'));
  const run=quick(f);
  assert.equal(run.status,0,run.stderr);
  const result=JSON.parse(run.stdout);
  assert.equal(result.mining.analyzedFiles,1);
  assert.equal(result.codeRoots.length,1);
  assert.ok(result.codeRoots[0].endsWith(path.join('Marketing','Portal')));
});
test('an ambiguous root-only React manifest refuses whole-repository fallback',t=>{
  const f=fixture(t);
  f.manifest('.',{react:'^18.0.0'});
  f.manifest('Backend/Web',{express:'^5.0.0'});
  f.put('Backend/Web/Service.ts','export const x=1');
  const run=quick(f,'--enrich','--semantic');
  assert.equal(run.status,2,run.stderr);
  const result=JSON.parse(run.stdout);
  assert.equal(result.status,'SOURCE_ROOT_UNCERTAIN');
  assert.equal(result.sourceDiscovery.status,'AMBIGUOUS_WORKSPACE_ROOT');
  assert.equal(result.mining.status,'NOT_RUN_UNVERIFIED_ROOTS');
  assert.equal(result.enrichment.status,'NOT_APPLIED_UNVERIFIED_ROOTS');
  assert.equal(fs.existsSync(path.join(f.data,'selfreview.config.json')),false);
});
test('malformed manifest produces explicit discovery incomplete and cannot mutate a catalog',t=>{
  const f=fixture(t);
  f.manifest('Apps/Deep/UI/Good',{react:'18'});
  f.put('Apps/Deep/UI/Good/src/App.tsx','export const App=()=> <div/>;\n');
  f.put('Apps/Another/package.json','{bad-json');
  const result=quick(f,'--enrich');
  assert.equal(result.status,2,result.stderr);
  const payload=JSON.parse(result.stdout);
  assert.equal(payload.status,'SOURCE_DISCOVERY_INCOMPLETE');
  assert.equal(payload.sourceDiscovery.coverage.complete,false);
  assert.ok(payload.sourceDiscovery.coverage.gaps.some(item=>item.reason==='PACKAGE_MANIFEST_PARSE_ERROR'));
  assert.equal(payload.enrichment.status,'NOT_APPLIED_UNVERIFIED_ROOTS');
  assert.equal(fs.existsSync(path.join(f.data,'selfreview.config.json')),false);
});
test('explicit source-path remains available even if no React dependency manifests exist',t=>{
  const f=fixture(t);
  f.put('Services/CustomUI/src/Component.tsx','export const Component=()=> <div/>;\n');
  const run=quick(f,'--source-path',path.join(f.root,'Services','CustomUI','src'));
  assert.equal(run.status,0,run.stderr||run.stdout);
  const payload=JSON.parse(run.stdout);
  assert.equal(payload.sourceDiscovery.mode,'EXPLICIT_SOURCE_ROOTS');
  assert.equal(payload.mining.analyzedFiles,1);
});
test('root without known React manifests is not scanned even if it contains many source files',t=>{
  const f=fixture(t);
  f.manifest('Web/Backend',{express:'^5.0.0'});
  f.put('Web/Backend/Service.ts','export const service=1');
  const run=quick(f,'--enrich');
  assert.equal(run.status,2,run.stderr);
  const report=JSON.parse(run.stdout);
  assert.equal(report.status,'SOURCE_ROOT_UNCERTAIN');
  assert.equal(report.sourceDiscovery.reactPackagesSelected,0);
  assert.equal(report.mining.analyzedFiles,0);
  assert.equal(report.enrichment.status,'NOT_APPLIED_UNVERIFIED_ROOTS');
});

test('discover-only lists deep package candidates without parsing source or creating a policy',t=>{
  const f=fixture(t);
  f.manifest('Web/Platform/Products/Marketing/ReactApp',{react:'^18'});
  f.put('Web/Platform/Products/Marketing/ReactApp/src/Invalid.tsx','invalid => <>');
  const output=quick(f,'--discover-only','--enrich','--semantic');
  assert.equal(output.status,0,output.stderr||output.stdout);
  const result=JSON.parse(output.stdout);
  assert.equal(result.mode,'quickstart-discovery');
  assert.equal(result.status,'REACT_PACKAGES_DISCOVERED');
  assert.equal(result.sourceCodeAnalyzed,false);
  assert.equal(result.catalogChanged,false);
  assert.equal(result.configCreated,false);
  assert.equal(result.sourceDiscovery.matches.length,1);
  assert.deepEqual(result.codeRoots,
    [path.join(f.root,'Web','Platform','Products','Marketing','ReactApp')]);
  assert.equal(fs.existsSync(path.join(f.data,'selfreview.config.json')),false);
  assert.equal(fs.existsSync(path.join(f.data,'react-apps.mine.json')),false);
});
