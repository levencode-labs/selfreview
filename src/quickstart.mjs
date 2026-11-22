import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, loadCatalog, projectInfo } from './config.mjs';
import { mineProject, enrichMine, publicMineReport } from './mine.mjs';
import { reviewProjectSemantics } from './semantic.mjs';
import { assert, contained, posix, slug, writeJson, EXCLUDED_DIRS } from './util.mjs';

// A local, noninteractive entry point: no target repo mutations, no user globals,
// no compiler plugins and no loss of existing approval decisions.
function projectRoots(root, explicitRoots) {
  if(explicitRoots?.length){
    const found=explicitRoots.map(input=>fs.realpathSync(path.resolve(input)));
    assert(found.every(folder=>contained(root,folder)&&fs.statSync(folder).isDirectory()),
      'All --source-path folders must exist under --project-path');
    for(let i=0;i<found.length;i++)for(let j=i+1;j<found.length;j++)
      assert(!contained(found[i],found[j])&&!contained(found[j],found[i]),
        'Overlapping source roots are not allowed');
    return [...new Set(found)].sort();
  }
  const found=[];
  function visit(directory,depth){
    if(depth>3)return;
    const entries=fs.readdirSync(directory,{withFileTypes:true});
    for(const entry of entries){
      if(!entry.isDirectory()||entry.isSymbolicLink()||EXCLUDED_DIRS.has(entry.name))continue;
      const folder=path.join(directory,entry.name);
      if(entry.name.toLowerCase()==='react-apps'){found.push(fs.realpathSync(folder));continue;}
      // Limit discovery to the top few levels instead of searching a huge repo.
      if(depth<3)visit(folder,depth+1);
    }
  }
  visit(root,0);
  return found.length?[...new Set(found)].sort():[root];
}
function preparedConfig(root,folder,filename){
  if(fs.existsSync(filename)){
    const context=loadConfig(filename);
    const project=context.config.projects.find(item=>projectInfo(context,item.id).root===root);
    assert(project, 'Existing SelfReview config does not register this project root: '+root+
      '. Use --config pointing at the right catalog; existing rules were not changed.');
    loadCatalog(context);
    return {context,projectId:project.id,scope:project.scope,created:false};
  }
  assert(!fs.existsSync(path.join(path.dirname(filename),'.selfreview','catalog.json')),
    'An existing SelfReview catalog was found without its config. Restore the config; no rules were overwritten.');
  assert(!fs.existsSync(path.join(root,'selfreview.config.json')) && !fs.existsSync(path.join(root,'.selfreview','catalog.json')),
    'Existing project-local SelfReview policy detected. Point --config at it; new separate catalogs are not created automatically.');
  const id=slug(path.basename(root)),scope=slug(path.basename(root))+'-web';
  const config={schemaVersion:1,catalog:'.selfreview/catalog.json',bestPractices:true,
    scopes:[{id:scope,extends:[],disabledRules:[]}],
    projects:[{id,root:posix(path.relative(path.dirname(filename),root))||'.',scope}]};
  // Validate the prospective configuration before its first persistent writes.
  const parent=path.dirname(filename);
  fs.mkdirSync(parent,{recursive:true});
  const tmp=path.join(parent,'.quickstart-validate-'+process.pid+'.json');
  try{
    writeJson(tmp,config);
    loadConfig(tmp);
    fs.renameSync(tmp,filename);
    writeJson(path.join(parent,'.selfreview','catalog.json'),{schemaVersion:1,rules:[]});
  }finally{try{fs.unlinkSync(tmp);}catch{}}
  return {context:loadConfig(filename),projectId:id,scope,created:true};
}
function autoTsconfig(root,roots){
  const candidates=new Set();
  const test=filename=>{
    try{if(fs.existsSync(filename)&&fs.statSync(filename).isFile())candidates.add(fs.realpathSync(filename));}catch{}
  };
  test(path.join(root,'tsconfig.json'));
  for(const selected of roots)test(path.join(selected,'tsconfig.json'));
  return [...candidates];
}

export function quickstartProject(options){
  const root=fs.realpathSync(path.resolve(options.projectPath));
  assert(fs.statSync(root).isDirectory(),'--project-path is not a directory');
  const folder=path.resolve(options.dataDir);
  assert(!contained(root,folder),'Results must be outside the inspected project repository');
  assert(!contained(folder,root),'Project must not be inside the SelfReview output directory');
  const configFile=path.resolve(options.configPath??path.join(folder,'selfreview.config.json'));
  if(!fs.existsSync(configFile))assert(contained(folder,configFile),
    'A new quickstart config must be created inside --data-dir; use --config to reuse an existing policy anywhere');
  const selected=projectRoots(root,options.sourcePaths);
  const rootFallback=!options.sourcePaths?.length&&selected.length===1&&selected[0]===root;
  const {context,projectId,scope,created}=preparedConfig(root,folder,configFile);
  const mine=mineProject(context,projectId,{codePaths:selected,
    minFiles:options.minFiles??3,maxFiles:options.maxFiles??20000,
    maxPatterns:options.maxPatterns??100});
  const reportPath=path.join(folder,'react-apps.mine.json');
  writeJson(reportPath,publicMineReport(mine));
  let enrichment={status:'NOT_REQUESTED'};
  if(options.enrich){
    enrichment=mine.coverage.complete&&!rootFallback
      ?{status:'CANDIDATES_IMPORTED',...enrichMine(context,mine)}
      :{status:'NOT_APPLIED_INCOMPLETE',reason:rootFallback?'react-apps was not found; select --source-path before importing candidates':'Fix coverage.gaps, then rerun'};
  }
  let semantic={status:'NOT_REQUESTED'},semanticPath=null;
  if(options.semantic){
    const tsconfigs=options.tsconfig?[path.resolve(options.tsconfig)]:autoTsconfig(root,selected);
    if(tsconfigs.length>1)semantic={status:'NOT_RUN_AMBIGUOUS_TSCONFIG',
      configs:tsconfigs,reason:'Run each application with its exact tsconfig; no arbitrary choice was made'};
    else{
      const reviewed=reviewProjectSemantics(context,loadCatalog(context),projectId,{
        codePaths:selected,maxFiles:options.maxSemanticFiles??4000,
        tsconfig:tsconfigs[0],profile:options.semanticProfile,
      });
      semanticPath=path.join(folder,'react-apps.semantic.json');
      writeJson(semanticPath,reviewed);
      semantic={status:reviewed.status,exitCode:reviewed.exitCode,coverage:reviewed.coverage,report:semanticPath};
    }
  }
  const status=rootFallback?'SOURCE_ROOT_UNCERTAIN':!mine.coverage.complete?'INCOMPLETE_MINING':
    semantic.status==='INCOMPLETE'?'INCOMPLETE_SEMANTIC':
    semantic.status==='NOT_RUN_AMBIGUOUS_TSCONFIG'?'SEMANTIC_REQUIRES_CONFIG':
    'READY';
  return {schemaVersion:1,mode:'quickstart',status,exitCode:status==='READY'?0:2,
    projectRoot:root,codeRoots:selected,config:configFile,project:projectId,scope,
    configCreated:created,
    existingPolicyPreserved:!created,
    firstTimeCatalog:created?{
      warning:'A new empty catalog was created. Any existing policy elsewhere must be selected using --config; it was not imported.'}:null,
    sourceDiscovery:rootFallback?{reason:'REACT_APPS_NOT_FOUND',action:'Pass --source-path with the actual React source folder; no enrichment was applied'}:
      {mode:options.sourcePaths?.length?'EXPLICIT':'AUTO_REACT_APPS'},
    mining:{report:reportPath,status:mine.status,analyzedFiles:mine.analyzedFiles,
      patternCount:mine.patterns.length,coverage:mine.coverage},
    enrichment,semantic,
    next:options.enrich?'Inspect candidate rules with rules list/show and preview; no automatic approvals.':
      'Inspect the generated report; rerun quickstart with --enrich only after checking the source observations.'};
}
