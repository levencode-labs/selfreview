import fs from 'node:fs';
import path from 'node:path';
import { EXCLUDED_DIRS, contained, posix, sha256 } from './util.mjs';

// Discover local package manifests as inert data, never by requiring their modules.
// Explicit bounded traversal avoids scanning generated .NET/Nx/Yarn output in large monorepos.
const IGNORED = new Set([...EXCLUDED_DIRS,
  '.nx','.yarn','.cache','.turbo','.output','.parcel-cache','.angular',
  'obj','bin','out','Debug','Release','storybook-static','tmp','temp']);
const REACT_MARKERS = new Set([
  'react','react-dom','react-native','react-scripts','next','gatsby',
  '@types/react','@vitejs/plugin-react','@vitejs/plugin-react-swc',
  '@remix-run/react','@tanstack/react-router',
]);
const MAX_DIRS=150000, MAX_MANIFESTS=20000, MAX_MANIFEST_SIZE=512*1024;
const MAX_REACT_ROOTS=100, MAX_DEPTH=100, MAX_GAPS=150;
const normalize = value => posix(value);
const relative = (root,file) => normalize(path.relative(root,file))||'.';
const exactDir = (a,b) => process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;

function markersFor(data){
  const deps={...data.dependencies,...data.devDependencies,...data.peerDependencies,...data.optionalDependencies};
  return [...REACT_MARKERS].filter(key=>typeof deps[key]==='string').sort();
}
function readManifest(filename,root){
  const file=relative(root,filename);
  const stat=fs.lstatSync(filename);
  if(!stat.isFile()||stat.isSymbolicLink())return {error:{path:file,reason:'PACKAGE_MANIFEST_NOT_REGULAR_FILE'}};
  if(stat.size>MAX_MANIFEST_SIZE)return {error:{path:file,reason:'PACKAGE_MANIFEST_TOO_LARGE',bytes:stat.size}};
  const content=fs.readFileSync(filename);
  const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(content);
  const data=JSON.parse(raw);
  if(!data||typeof data!=='object'||Array.isArray(data))
    return {error:{path:file,reason:'INVALID_PACKAGE_MANIFEST'}};
  return {manifest:{
    path:file, directory:relative(root,path.dirname(filename)),
    name:typeof data.name==='string'?data.name:null,
    markers:markersFor(data),sha256:sha256(content),
    hasWorkspaces:Boolean(data.workspaces),
  }};
}

export function discoverReactPackages(projectRoot){
  const root=fs.realpathSync(path.resolve(projectRoot));
  const visited=new Set(),stack=[{folder:root,depth:0}];
  const matches=[],manifestList=[],gaps=[];
  let scannedDirectories=0,packageJsonScanned=0,skippedGeneratedDirectories=0,
    skippedSymlinks=0,unmatchedManifests=0,truncatedGaps=0;

  function gap(entry){
    if(gaps.length<MAX_GAPS)gaps.push(entry);
    else truncatedGaps++;
  }
  while(stack.length){
    const {folder,depth}=stack.pop();
    if(visited.has(folder))continue;
    visited.add(folder);
    scannedDirectories++;
    if(scannedDirectories>MAX_DIRS){
      gap({path:relative(root,folder),reason:'DIRECTORY_DISCOVERY_LIMIT',limit:MAX_DIRS});
      break;
    }
    let entries;
    try{entries=fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'));}
    catch(error){gap({path:relative(root,folder),reason:'DIRECTORY_UNREADABLE',code:error.code??'UNKNOWN'});continue;}
    for(const entry of entries){
      const child=path.join(folder,entry.name);
      if(entry.isSymbolicLink()){
        if(IGNORED.has(entry.name)) {skippedGeneratedDirectories++;continue;}
        skippedSymlinks++;
        gap({path:relative(root,child),reason:'SYMLINK_NOT_FOLLOWED'});
        continue;
      }
      if(entry.isDirectory()){
        if(IGNORED.has(entry.name)){skippedGeneratedDirectories++;continue;}
        if(depth+1>MAX_DEPTH){
          gap({path:relative(root,child),reason:'DEPTH_DISCOVERY_LIMIT',limit:MAX_DEPTH});
          continue;
        }
        stack.push({folder:child,depth:depth+1});
      } else if(entry.isFile()&&entry.name==='package.json'){
        if(packageJsonScanned>=MAX_MANIFESTS){
          gap({path:relative(root,child),reason:'PACKAGE_MANIFEST_LIMIT',limit:MAX_MANIFESTS});
          stack.length=0;break;
        }
        packageJsonScanned++;
        try{
          const parsed=readManifest(child,root);
          if(parsed.error){gap(parsed.error);continue;}
          const item=parsed.manifest;
          manifestList.push(item);
          if(item.markers.length)matches.push(item);
          else unmatchedManifests++;
        }catch(error){
          gap({path:relative(root,child),reason:'PACKAGE_MANIFEST_PARSE_ERROR',
            code:error.code??(error instanceof SyntaxError?'INVALID_JSON':'INVALID_UTF8_OR_READ')});
        }
      }
    }
  }
  // Prefer explicitly described nested React packages over their ancestor workspace
  // shell. In particular, never silently scan an entire polyglot monorepo.
  const candidates=matches.sort((a,b)=>a.directory.split('/').length-b.directory.split('/').length||
    a.directory.localeCompare(b.directory,'en'));
  const selected=[],omitted=[];
  for(const item of candidates){
    const folder=path.resolve(root,item.directory);
    if(exactDir(folder,root)&&manifestList.some(other=>other.directory!=='.')){
      omitted.push({path:item.directory,reason:'WORKSPACE_ROOT_NOT_AUTO_SELECTED'});continue;
    }
    if(candidates.some(other=>other!==item&&other.directory!==item.directory&&
      contained(folder,path.resolve(root,other.directory)))){
      omitted.push({path:item.directory,reason:'NESTED_REACT_PACKAGE_SELECTED'});continue;
    }
    selected.push(item);
    if(selected.length>MAX_REACT_ROOTS){
      gap({path:item.directory,reason:'REACT_PACKAGE_LIMIT',limit:MAX_REACT_ROOTS});
      selected.pop();break;
    }
  }
  const codeRoots=selected.map(item=>path.resolve(root,item.directory)).sort();
  const status=gaps.length?'INCOMPLETE':
    codeRoots.length?'FOUND_REACT_PACKAGES':matches.length?'AMBIGUOUS_WORKSPACE_ROOT':'NO_REACT_PACKAGES';
  return {
    status,complete:gaps.length===0,mode:'RECURSIVE_PACKAGE_JSON',
    discoveryDepthLimit:MAX_DEPTH,scanRoot:root,
    packageJsonScanned,scannedDirectories,reactPackagesMatched:matches.length,
    reactPackagesSelected:codeRoots.length,unmatchedManifests,
    skippedGeneratedDirectories,skippedSymlinks,
    matches:selected.map(item=>({
      path:item.directory,manifest:item.path,name:item.name,
      evidence:{kind:'package.json',sha256:item.sha256,reactMarkers:item.markers},
    })),
    omitted,codeRoots,coverage:{
      complete:gaps.length===0,gaps,gapCount:gaps.length+truncatedGaps,
      omittedGapDetails:truncatedGaps,
      note:'Only packages with explicit React-related dependencies are auto-selected. Workspace roots and unrelated packages are not treated as React projects.',
    },
  };
}
