/** Validated atomic database batch using the authenticated project-linked CLI. */
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {directoryBatchSchema,directoryBatchSql} from '../src/lib/ingestion/directory-batch.ts';
const [file,flag]=process.argv.slice(2);
if(!file||(flag&&flag!=='--confirm')||process.argv.length>4)throw new Error('Usage: npm run publish:directory -- batch.json [--confirm]');
const batch=directoryBatchSchema.parse(JSON.parse(readFileSync(resolve(file),'utf8')));
const sql=directoryBatchSql(batch);
console.log(`Validated ${batch.records.length} cemetery records. Physical interment remains unconfirmed.`);
if(flag==='--confirm'){
 const ref=readFileSync('supabase/.temp/project-ref','utf8').trim();
 if(ref!=='ttssyodmfybcadqahfeg')throw new Error('CLI is linked to the wrong project');
 const dir=mkdtempSync(join(tmpdir(),'findthedead-directory-'));
 try{const path=join(dir,'release.sql');writeFileSync(path,sql,{mode:0o600});const r=spawnSync('supabase',['db','query','--linked','--file',path],{stdio:'inherit'});if(r.error||r.status!==0)throw new Error('Atomic directory batch failed; inspect CLI output.');console.log(`Released batch ${batch.batch_id}. Run public checks.`);}finally{rmSync(dir,{recursive:true,force:true});}
}else console.log('Validation only. No database writes.');
