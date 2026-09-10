/** Bounded set-based transactions with immutable IDs and a single local publisher. */
import {readFileSync,readdirSync,writeFileSync,mkdtempSync,rmSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';
import {nationalBatchSchema,nationalBatchSql} from '../src/lib/ingestion/national-directory.ts';
const args=process.argv.slice(2);const dir=resolve(args[0]??'');if(!args[0]||args.some((a,i)=>i>0&&!['--confirm','--canary'].includes(a)))throw new Error('Usage: npm run publish:national -- directory [--confirm] [--canary]');
const files=readdirSync(dir).filter(f=>/^batch-\d+\.json$/.test(f)).sort();if(!files.length)throw new Error('No batches');
const batches=files.map(f=>({file:f,batch:nationalBatchSchema.parse(JSON.parse(readFileSync(join(dir,f),'utf8')))}));
console.log(`Validated ${batches.reduce((n,b)=>n+b.batch.records.length,0)} listings in ${batches.length} batches.`);
if(args.includes('--confirm')){
 if(readFileSync('supabase/.temp/project-ref','utf8').trim()!=='ttssyodmfybcadqahfeg')throw new Error('Wrong project');
 const lock=join(dir,'publisher.lock');writeFileSync(lock,JSON.stringify({pid:process.pid,at:new Date().toISOString()}),{flag:'wx'});
 const temp=mkdtempSync(join(tmpdir(),'ftd-national-'));
 try{const results=[];for(const {file,batch} of args.includes('--canary')?batches.slice(0,1):batches){const started=Date.now();const sql=join(temp,'batch.sql');writeFileSync(sql,nationalBatchSql(batch),{mode:0o600});const r=spawnSync('supabase',['db','query','--linked','--file',sql],{encoding:'utf8',maxBuffer:200000});if(r.status!==0){console.error(r.stderr);throw new Error('Atomic batch failed: '+file);}const output=JSON.parse(r.stdout);if(output.rows?.[0]?.published!==batch.records.length)throw new Error('Unexpected release count');results.push({batch_id:batch.batch_id,records:batch.records.length,elapsed_ms:Date.now()-started});writeFileSync(join(dir,args.includes('--canary')?'canary-release.json':'release-results.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));console.log(`${batch.batch_id}: ${batch.records.length} released (${Date.now()-started}ms)`);}}
 finally{rmSync(temp,{recursive:true,force:true});unlinkSync(lock);}
}else console.log('Validation only; no writes.');
