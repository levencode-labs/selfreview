import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, loadCatalog, projectInfo } from './config.mjs';
import { mineProject, enrichMine, publicMineReport } from './mine.mjs';
import { reviewProjectSemantics } from './semantic.mjs';
import { assert, contained, posix, slug, writeJson } from './util.mjs';
import { discoverReactPackages } from './react-discovery.mjs';

// A local, noninteractive entry point: no target repo mutations, no user globals,
// no compiler plugins and no loss of existing approval decisions.
function projectRoots(root, explicitRoots) {
  if (!explicitRoots?.length) return discoverReactPackages(root);
  const found = explicitRoots.map(input => {
    const folder=fs.realpathSync(path.resolve(input));
    assert(contained(root,folder) && fs.statSync(folder).isDirectory(),
      'All --source-path folders must exist under --project-path');
    return folder;
  });
  const unique=[...new Set(found)].sort();
  for(let i=0;i<unique.length;i++)for(let j=i+1;j<unique.length;j++) {
    assert(!contained(unique[i],unique[j]),'Overlapping source roots are not allowed');
  }
  return {status:'EXPLICIT',mode:'EXPLICIT_SOURCE_ROOTS',complete:true,codeRoots:unique,
    matches:[],coverage:{complete:true,gaps:[],gapCount:0}};
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
  const sourceDiscovery=projectRoots(root,options.sourcePaths);
  const selected=sourceDiscovery.codeRoots;
  if(!sourceDiscovery.complete || !selected.length) {
    const incomplete=!sourceDiscovery.complete;
    const status=incomplete?'SOURCE_DISCOVERY_INCOMPLETE':'SOURCE_ROOT_UNCERTAIN';
    return {schemaVersion:1,mode:'quickstart',status,exitCode:2,
      projectRoot:root,codeRoots:selected,config:configFile,
      configCreated:false,existingPolicyPreserved:true,
      sourceDiscovery,
      mining:{status:'NOT_RUN_UNVERIFIED_ROOTS',analyzedFiles:0,patternCount:0},
      enrichment:{status:'NOT_APPLIED_UNVERIFIED_ROOTS'},
      semantic:{status:'NOT_RUN_UNVERIFIED_ROOTS'},
      next:incomplete?
        'Resolve sourceDiscovery.coverage.gaps; no catalog changes or source analysis were performed.':
        'No safe React package roots selected. Inspect sourceDiscovery.matches/omitted or pass --source-path; no full-repository fallback was run.'};
  }
  const {context,projectId,scope,created}=preparedConfig(root,folder,configFile);
  const mine=mineProject(context,projectId,{codePaths:selected,
    minFiles:options.minFiles??3,maxFiles:options.maxFiles??20000,
    maxPatterns:options.maxPatterns??100});
  const reportPath=path.join(folder,'react-apps.mine.json');
  writeJson(reportPath,publicMineReport(mine));
  let enrichment={status:'NOT_REQUESTED'};
  if(options.enrich){
    enrichment=mine.coverage.complete&&mine.analyzedFiles>0
      ?{status:'CANDIDATES_IMPORTED',...enrichMine(context,mine)}
      :{status:'NOT_APPLIED_INCOMPLETE',reason:'No complete analyzable React sources; fix mining.coverage.gaps before enriching.'};
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
  const status=!mine.coverage.complete||mine.analyzedFiles===0?'INCOMPLETE_MINING':
    semantic.status==='INCOMPLETE'?'INCOMPLETE_SEMANTIC':
    semantic.status==='NOT_RUN_AMBIGUOUS_TSCONFIG'?'SEMANTIC_REQUIRES_CONFIG':
    semantic.exitCode===1?'VIOLATIONS':
    'READY';
  return {schemaVersion:1,mode:'quickstart',status,exitCode:status==='READY'?0:status==='VIOLATIONS'?1:2,
    projectRoot:root,codeRoots:selected,config:configFile,project:projectId,scope,
    configCreated:created,
    existingPolicyPreserved:!created,
    firstTimeCatalog:created?{
      warning:'A new empty catalog was created. Any existing policy elsewhere must be selected using --config; it was not imported.'}:null,
    sourceDiscovery,
    mining:{report:reportPath,status:mine.status,analyzedFiles:mine.analyzedFiles,
      patternCount:mine.patterns.length,coverage:mine.coverage},
    enrichment,semantic,
    next:options.enrich?'Inspect candidate rules with rules list/show and preview; no automatic approvals.':
      'Inspect the generated report; rerun quickstart with --enrich only after checking the source observations.'};
}
