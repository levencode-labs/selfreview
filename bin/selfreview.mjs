#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, loadCatalog, mutateCatalog, projectInfo, allScopeRules } from '../src/config.mjs';
import { approveRule, behaviorHash, KINDS } from '../src/rules.mjs';
import { reviewProject, renderReport, diffFromGit } from '../src/review.mjs';
import { learnScope, refreshScope } from '../src/learn.mjs';
import { mineProject, enrichMine, publicMineReport, readMineKnowledge } from '../src/mine.mjs';
import { reviewProjectSemantics } from '../src/semantic.mjs';
import { quickstartProject } from '../src/quickstart.mjs';
import { sourceStatus, ruleHistory, previewRule, recordRuleDecision } from '../src/lifecycle.mjs';
import { createTaskContext, checkTaskContext } from '../src/context.mjs';
import { exportScope, createAgentPack } from '../src/export.mjs';
import { assert, readJson, writeJson, writeAtomic, slug, posix, VERSION } from '../src/util.mjs';

const HELP = `SelfReview ${VERSION} — локальное ревью JS/TS с конвенциями по скоупам

node bin/selfreview.mjs COMMAND [options]

init --scope NAME --project FOLDER [--project FOLDER ...]
scope add NAME --project FOLDER [--project FOLDER ...] [--extends PARENT]
learn --scope NAME [--docs FILE_OR_FOLDER ...] [--mr FILE ...]
      [--diff FILE --comments FILE] [--proposals JSON] [--no-code]
      [--code FOLDER ...] [--min-samples 5] [--threshold 0.9]
mine --project ID [--code FOLDER ...] [--min-files 3]
     [--max-files 20000] [--max-patterns 60] [--out REPORT.json] [--enrich]
quickstart --project-path FOLDER [--data-dir FOLDER] [--source-path FOLDER ...]
           [--enrich] [--semantic] [--tsconfig FILE] [--max-semantic-files 4000]
semantic --project ID [--code FOLDER ...] [--tsconfig FILE]
         [--semantic-profile FILE] [--max-semantic-files 4000] [--out FILE]
rules list [--scope NAME] [--json]
rules show RULE_ID
rules history RULE_ID
rules preview RULE_ID [--project ID] [--file PATH ...]
rules approve RULE_ID --by NAME --reason TEXT
rules reject RULE_ID --by NAME --reason TEXT
sources status [--scope NAME]
sources refresh --scope NAME
context --project ID [--file PATH ...] [--out FILE]
context check --input FILE
review --project ID [--diff FILE | --base REF] [--file PATH ...]
       [--merge-base] [--staged] [--new-only] [--semantic]
       [--semantic-code FOLDER ...] [--tsconfig FILE] [--semantic-profile FILE]
       [--max-semantic-files 4000] [--format text|json] [--out FILE]
review --scope NAME [--format text|json] [--out FILE]
agent-pack --project ID [--diff FILE | --base REF] [--knowledge REPORT.json] --out FILE
export --scope NAME --out NEW_FOLDER [--project ID]
doctor

Global: --config FILE (default: ./selfreview.config.json), --help, --version

Import creates candidates only. Approve each reviewed rule explicitly.
Exit codes: 0 = completed, 1 = enforced error, 2 = incomplete/configuration error.
ADVISORY_ONLY, NO_CHANGES, NOT_APPLICABLE and MANUAL_REVIEW_REQUIRED are not full code approval.
--file paths are project-relative; repeat the option for multiple files.
Semantic graph is bounded, opt-in and requires a supported current-file snapshot.
Approved manual rules plus SHA-pinned evidence are required for semantic enforcement.
No AI API or network requests; no execution of inspected project code.
`;

function argumentsOf(args) {
  const positional=[],options={};
  const booleans=new Set(['help','version','json','no-code','merge-base','staged','new-only','enrich','semantic']);
  const values=new Set(['config','scope','project','extends','docs','mr','diff','comments','proposals','code','min-samples','threshold','min-files','max-files','max-patterns','knowledge','tsconfig','semantic-profile','max-semantic-files','semantic-code','project-path','data-dir','source-path','by','reason','format','out','base','file','input']);
  for (let i=0;i<args.length;i++) {
    const arg=args[i];
    if (!arg.startsWith('--')) {positional.push(arg);continue;}
    const key=arg.slice(2);assert(booleans.has(key)||values.has(key),`Unknown option: ${arg}`);
    if (booleans.has(key)) options[key]=true;
    else {assert(args[i+1]!==undefined && !args[i+1].startsWith('--'),`Missing value for ${arg}`);(options[key]??=[]).push(args[++i]);}
  }
  return {positional,options};
}
const one=(options,key,fallback)=>{const values=options[key];if(!values)return fallback;assert(values.length===1,`--${key} may appear only once`);return values[0];};
function saveValidatedConfig(file,config) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temporary=path.join(path.dirname(file),`.selfreview-validate-${process.pid}.json`);
  try {writeJson(temporary,config);loadConfig(temporary);writeJson(file,config);}
  finally {try{fs.unlinkSync(temporary);}catch{}}
}
function addProjects(config,baseDir,scope,folders) {
  assert(folders.length>0,'Provide at least one --project folder');
  for(const folder of folders) {
    const absolute=fs.realpathSync(path.resolve(folder));assert(fs.statSync(absolute).isDirectory(),`Not a directory: ${folder}`);
    const relative=posix(path.relative(baseDir,absolute))||'.';
    const same=config.projects.find(p=>path.resolve(baseDir,p.root)===absolute);assert(!same,`Folder already registered as ${same?.id}`);
    const base=slug(path.basename(absolute));let id=base,index=2;while(config.projects.some(p=>p.id===id))id=`${base}-${index++}`;
    config.projects.push({id,root:relative,scope});
  }
}
function output(value,options,{text}={}) {
  const format=one(options,'format',options.json?'json':'text');assert(['text','json'].includes(format),'--format must be text or json');
  const rendered=format==='json'||!text?JSON.stringify(value,null,2)+'\n':text;
  const file=one(options,'out');if(file){writeAtomic(path.resolve(file),rendered);console.log(`Written: ${path.resolve(file)}`);}else process.stdout.write(rendered);
}
function selectedProjects(context,options) {
  const project=one(options,'project'),scope=one(options,'scope');assert(!(project&&scope),'Use --project or --scope for review');
  if(project)return [projectInfo(context,project).id];
  if(scope){const ids=context.config.projects.filter(p=>p.scope===scope).map(p=>p.id);assert(ids.length,`No projects in scope ${scope}`);return ids;}
  assert(context.config.projects.length===1,'Select --project ID or --scope NAME');return [context.config.projects[0].id];
}
function semanticOptions(options) {
  const codePaths=options['semantic-code']??[];
  const tsconfig=one(options,'tsconfig');
  const profile=one(options,'semantic-profile');
  const maxFiles=Number(one(options,'max-semantic-files','4000'));
  assert(Number.isSafeInteger(maxFiles)&&maxFiles>0&&maxFiles<=10000,'Invalid --max-semantic-files');
  return {codePaths,tsconfig,profile,maxFiles};
}
function reviewOptions(context,project,options) {
  const diff=one(options,'diff'),base=one(options,'base');assert(!(diff&&base),'Use --diff or --base, not both');
  assert(!options['merge-base']||base,'--merge-base requires --base');
  assert(!options.staged||!diff,'--staged cannot be combined with --diff');
  assert(!options['new-only']||base||options.staged,'--new-only requires --base or --staged');
  assert(!options['new-only']||!diff,'--new-only requires a trusted local Git baseline');
  assert(options.semantic||!(options['semantic-code']||options.tsconfig||options['semantic-profile']||options['max-semantic-files']),
    'Semantic options require --semantic');
  const selection={...(options.file?{files:options.file}:{}),newOnly:!!options['new-only'],
    ...(options.semantic?{semantic:semanticOptions(options)}:{})};
  if(base||options.staged)return {...diffFromGit(projectInfo(context,project).root,base??'HEAD',{mergeBase:!!options['merge-base'],staged:!!options.staged}),...selection};
  return diff?{diffText:fs.readFileSync(path.resolve(diff),'utf8'),...selection}:selection;
}
export function main(args=process.argv.slice(2)) {
  const {positional,options}=argumentsOf(args),[command,action,id]=positional;
  if(options.version){console.log(VERSION);return 0;}
  if(options.help||!command||command==='help'){console.log(HELP);return 0;}
  const configPath=path.resolve(one(options,'config','selfreview.config.json'));
  if(command==='quickstart'){
    const projectPath=one(options,'project-path');
    assert(projectPath,'quickstart requires --project-path');
    const absolute=fs.realpathSync(path.resolve(projectPath));
    const dataDir=one(options,'data-dir',path.join(path.dirname(absolute),'selfreview-data',path.basename(absolute)));
    const numeric=(key,fallback)=>{
      const v=one(options,key,String(fallback));assert(/^\d+$/.test(v),'Invalid --'+key);return Number(v);
    };
    const result=quickstartProject({
      projectPath:absolute,dataDir,configPath:one(options,'config'),
      sourcePaths:options['source-path']??[],enrich:!!options.enrich,semantic:!!options.semantic,
      tsconfig:one(options,'tsconfig'),semanticProfile:one(options,'semantic-profile'),
      minFiles:numeric('min-files',3),maxFiles:numeric('max-files',20000),
      maxPatterns:numeric('max-patterns',100),maxSemanticFiles:numeric('max-semantic-files',4000),
    });
    output(result,options,{text:JSON.stringify(result,null,2)+'\n'});
    return result.exitCode;
  }
  if(command==='init') {
    assert(!fs.existsSync(configPath),'Config already exists. Use scope add or edit the existing config.');
    const scope=one(options,'scope','default'),baseDir=path.dirname(configPath),catalogPath=path.join(baseDir,'.selfreview','catalog.json');
    assert(!fs.existsSync(catalogPath),'Catalog already exists; restore the config instead of overwriting rules.');
    const config={schemaVersion:1,catalog:'.selfreview/catalog.json',bestPractices:true,scopes:[{id:scope,extends:[],disabledRules:[]}],projects:[]};
    addProjects(config,baseDir,scope,options.project??[process.cwd()]);saveValidatedConfig(configPath,config);writeJson(catalogPath,{schemaVersion:1,rules:[]});
    output({config:configPath,projects:config.projects,next:'learn --scope '+scope},options);return 0;
  }
  const context=loadConfig(configPath);
  if(command==='scope'&&action==='add') {
    assert(id,'scope add requires NAME');
    const config=structuredClone(context.config);
    const existing=config.scopes.find(s=>s.id===id);
    if(!existing)config.scopes.push({id,extends:options.extends??[],disabledRules:[]});
    else assert(!options.extends,'Edit existing scope inheritance in the config explicitly');
    addProjects(config,context.baseDir,id,options.project??[]);saveValidatedConfig(configPath,config);
    output({scope:id,projects:config.projects.filter(p=>p.scope===id)},options);return 0;
  }
  if(command==='learn') {
    const scope=one(options,'scope');assert(scope,'learn requires --scope');
    const minSamples=Number(one(options,'min-samples','5')),threshold=Number(one(options,'threshold','0.9'));
    assert(Number.isInteger(minSamples)&&minSamples>=1&&minSamples<=100000,'Invalid --min-samples');assert(Number.isFinite(threshold)&&threshold>0&&threshold<=1,'Invalid --threshold');
    const result=learnScope(context,scope,{docs:options.docs??[],mrs:options.mr??[],proposals:options.proposals??[],diff:one(options,'diff'),comments:one(options,'comments'),code:!options['no-code'],codePaths:options.code??[],minSamples,threshold});
    output(result,options);return 0;
  }
  if(command==='mine') {
    const projectId=one(options,'project');
    assert(projectId && !one(options,'scope'),'mine requires one explicit --project ID, not --scope');
    const numbers={minFiles:one(options,'min-files','3'),maxFiles:one(options,'max-files','20000'),maxPatterns:one(options,'max-patterns','60')};
    for(const [key,value] of Object.entries(numbers))assert(/^\d+$/.test(value),'Invalid --'+key);
    const report=mineProject(context,projectId,{codePaths:options.code??[],
      minFiles:Number(numbers.minFiles),maxFiles:Number(numbers.maxFiles),maxPatterns:Number(numbers.maxPatterns)});
    const summary=publicMineReport(report);
    if(options.enrich && report.coverage.complete)summary.enrichment=enrichMine(context,report);
    else if(options.enrich)summary.enrichment={status:'NOT_APPLIED_INCOMPLETE',reason:'Resolve coverage gaps before updating the catalog'};
    output(summary,options);
    return report.exitCode;
  }
  if(command==='rules') {
    if(['approve','reject'].includes(action)) {
      assert(id,`rules ${action} requires RULE_ID`);
      const by=one(options,'by'),reason=one(options,'reason');assert(by?.trim()&&reason?.trim(),'Decision requires --by and --reason');
      const result=mutateCatalog(context,catalog=>{
        const index=catalog.rules.findIndex(r=>r.id===id);assert(index>=0,`Unknown rule: ${id}`);
        const before=structuredClone(catalog.rules[index]);
        if(action==='approve')catalog.rules[index]=approveRule(catalog.rules[index],by,reason);
        else {catalog.rules[index]={...catalog.rules[index],status:'rejected',rejection:{by,reason,at:new Date().toISOString()}};delete catalog.rules[index].approval;}
        const after=catalog.rules[index];
        recordRuleDecision(catalog,id,{from:before.status,to:after.status,by,reason,at:after.approval?.at??after.rejection.at,behaviorHash:behaviorHash(after),before});
        return catalog.rules[index];
      },{allowStale:true});output(result,options);return 0;
    }
    const catalog=loadCatalog(context,{allowStale:true});
    if(action==='show') {const rule=catalog.rules.find(r=>r.id===id);assert(rule,`Unknown rule: ${id}`);output(rule,options);return 0;}
    if(action==='history') {assert(id,'rules history requires RULE_ID');output(ruleHistory(context,catalog,id),options);return 0;}
    if(action==='preview') {
      assert(id,'rules preview requires RULE_ID');
      const projectId=one(options,'project');
      assert(!one(options,'diff')&&!one(options,'base')&&!options.staged&&!options['new-only']&&!options['merge-base'],'Candidate preview uses current files; Git baseline modes belong to review');
      const result=previewRule(context,catalog,id,{projectId,scope:one(options,'scope'),files:options.file});
      output(result,options);return result.reports?.some(report=>report.exitCode===2)?2:0;
    }
    assert(action==='list','Use rules list/show/history/preview/approve/reject');
    const scope=one(options,'scope'),rules=scope?allScopeRules(context.config,catalog,scope):catalog.rules;
    output(rules,options,{text:rules.map(r=>`${r.id} | ${r.scope} | ${r.status} | ${r.check.kind} | ${r.title}`).join('\n')+'\n'});return 0;
  }
  const catalog=loadCatalog(context);
  if(command==='semantic'){
    const projectId=one(options,'project');
    assert(projectId&&!one(options,'scope'),'semantic requires one explicit --project');
    assert(!options.staged&&!options['new-only']&&!options['merge-base']&&!one(options,'base')&&!one(options,'diff'),
      'Semantic standalone command uses current project snapshot; use review --semantic for Git diffs');
    const semantic={...semanticOptions(options),codePaths:options.code??[]};
    const report=reviewProjectSemantics(context,catalog,projectId,semantic);
    output(report,{...options,format:['json']});
    return report.exitCode;
  }
  if(command==='sources') {
    assert(['status','refresh'].includes(action),'Use sources status or sources refresh');
    const scope=one(options,'scope');
    if(action==='status') {output(sourceStatus(context,catalog,{scope}),options);return 0;}
    assert(scope,'sources refresh requires --scope');
    const result=refreshScope(context,scope);output(result,options);
    return result.exitCode??(result.status==='INCOMPLETE'?2:0);
  }
  if(command==='context') {
    if(action==='check') {
      assert(!['project','scope','file','base','diff','staged','new-only','merge-base'].some(key=>options[key]!==undefined),'context check uses the saved selection; do not supply project/scope/file or Git mode selectors');
      const input=one(options,'input');assert(input,'context check requires --input');
      assert(fs.statSync(path.resolve(input)).size<=8*1024*1024,'Saved context exceeds 8 MiB');
      const result=checkTaskContext(context,catalog,readJson(path.resolve(input)));output(result,options);return result.exitCode;
    }
    assert(!action,'Use context or context check');
    assert(!one(options,'diff')&&!one(options,'base')&&!options.staged&&!options['new-only']&&!options['merge-base'],'context prepares working-tree files; use agent-pack for a Git review');
    const ids=selectedProjects(context,options);assert(ids.length===1,'context requires a single project');
    const result=createTaskContext(context,catalog,ids[0],{files:options.file});output(result,options);return result.exitCode;
  }
  if(command==='review'||command==='agent-pack') {
    const ids=selectedProjects(context,options);
    assert(ids.length===1||(!one(options,'diff')&&!one(options,'base')&&!options.staged&&!options.file),'Diff/base/staged/file selection requires one project');
    const reports=ids.map(project=>reviewProject(context,catalog,project,reviewOptions(context,project,options)));
    if(command==='agent-pack'){
      assert(ids.length===1,'agent-pack requires a single project');assert(one(options,'out'),'agent-pack requires --out');
      const pack=createAgentPack(context,catalog,reports[0]);
      const knowledgeFile=one(options,'knowledge');
      if(knowledgeFile)pack.minedKnowledge=readMineKnowledge(context,ids[0],knowledgeFile);
      output(pack,{...options,format:['json']});
    }
    else output(reports.length===1?reports[0]:{schemaVersion:1,reports,exitCode:Math.max(...reports.map(r=>r.exitCode))},options,{text:reports.map(renderReport).join('\n')});
    return Math.max(...reports.map(r=>r.exitCode));
  }
  if(command==='export') {
    const scope=one(options,'scope'),out=one(options,'out');assert(scope&&out,'export requires --scope and --out');
    const result=exportScope(context,catalog,scope,out,{projectId:one(options,'project')});console.log(JSON.stringify(result,null,2));return 0;
  }
  if(command==='doctor') {
    const results=context.config.projects.map(p=>({id:p.id,scope:p.scope,root:projectInfo(context,p.id).root}));
    output({status:'CONFIG_VALID',version:VERSION,node:process.version,projects:results,rules:catalog.rules.length,checks:Object.keys(KINDS),network:false,projectCodeExecution:false,note:'Configuration validation only. Run review for code and per-file rule conflicts.'},options);return 0;
  }
  throw new Error(`Unknown command: ${positional.join(' ')}`);
}

try { process.exitCode=main(); }
catch(error) { console.error(`SelfReview INCOMPLETE: ${error.message}`); process.exitCode=2; }
