import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const paths=[...new Set(execFileSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,'ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))];
const findings=[];
const patterns=[['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['GitHub access token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],['AWS access key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],['Google API key',/\bAIza[A-Za-z0-9_-]{35}\b/],['live payment secret',/\bsk_live_[A-Za-z0-9]{20,}\b/]];
for(const path of paths){
 const example=/(?:^|\/)\.env\.example$|(?:^|\/)environment\.example$/.test(path);
 if((/(?:^|\/)\.env(?:\.|$)/.test(path)&&!example)||/\.(?:sqlite(?:-wal|-shm)?|db(?:-wal|-shm)?|pem|key|p12|pfx)$/i.test(path)||/^(?:data|uploads|backups)\/(?!\.gitkeep$)/.test(path)||path.startsWith('.agent-churn-control/'))findings.push({path,kind:'private/generated file included in repository'});
 if(!/\.(?:[cm]?js|tsx?|json|md|html|ya?ml|txt|example)$/.test(path)&&!example)continue;
 let content;try{content=readFileSync(path,'utf8');}catch{continue;}
 for(const [kind,pattern] of patterns)if(pattern.test(content))findings.push({path,kind});
}
console.log(JSON.stringify({filesChecked:paths.length,findings},null,2));
if(findings.length)process.exitCode=1;
