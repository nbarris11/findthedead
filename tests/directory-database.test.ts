import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {postgis} from '@electric-sql/pglite-postgis';

test('directory batches are atomic, idempotent, private, and reversible',async()=>{
 const db=await PGlite.create({extensions:{postgis}});
 try{
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 const c=await db.query<{id:string}>(`insert into public.cemeteries(slug,name,country,status,location) values('arlington','Arlington National Cemetery','US','published',extensions.st_setsrid(extensions.st_makepoint(-77,38),4326)) returning id`);
 const cemetery=c.rows[0].id;
 await db.query(`insert into public.sources(source_type,url,external_id,retrieved_at,field,confidence,cemetery_id) values('wikidata','https://www.wikidata.org/wiki/Q216344','Q216344',now(),'cemetery',1,$1)`,[cemetery]);
 const record={wikidata_id:'Q123',slug:'example-person',name:'Example Person',birth_year:1900,death_year:1980,cemetery_id:cemetery,source_record_id:'arlington:123:456',source_url:'https://wspublic.eiss.army.mil/IssRetrieveServices.svc/search?q=ISS_ID%3D123',source_sha256:'a'.repeat(64),retrieved_at:new Date().toISOString(),provider:'arlington',section:'1',grave:'2',disclaimer:'Government source disclaimer preserved in this test fixture.'};
 const publish=(id:string,rows:unknown[])=>db.query('select private.publish_directory_batch($1,$2::jsonb) as count',[id,JSON.stringify(rows)]);
 await assert.rejects(publish('failed-batch',[record,{...record,wikidata_id:'Q124',slug:'invalid-person',source_record_id:'arlington:124:456',cemetery_id:'00000000-0000-0000-0000-000000000000'}]));
 assert.equal((await db.query('select * from people')).rows.length,0);
 assert.equal((await db.query('select * from private.directory_batches')).rows.length,0);
 await publish('good-batch',[record]);await publish('good-batch',[record]);
 assert.equal((await db.query('select * from people')).rows.length,1);
 await assert.rejects(publish('good-batch',[{...record,name:'Changed name'}]));
 await assert.rejects(publish('duplicate-person',[{...record,slug:'changed-slug'}]));
 await db.exec('set role anon');
 const visible=await db.query<{profile_tier:string;birth_date:null;biography:null;dead_score:number}>('select profile_tier,birth_date,biography,dead_score from people');
 assert.deepEqual(visible.rows[0],{profile_tier:'cemetery_record',birth_date:null,biography:null,dead_score:0});
 assert.equal((await db.query("select * from public.search_people('example')")).rows.length,1);
 assert.equal((await db.query('select * from public.nearby_people(38,-77)')).rows.length,1);
 assert.equal((await db.query('select * from public.people_in_bounds(-78,37,-76,39)')).rows.length,1);
 await assert.rejects(db.query('select * from private.directory_batches'),/permission denied/);
 await assert.rejects(publish('unauthorized',[record]),/permission denied/);
 await db.exec('reset role');
 await db.query('select private.withdraw_directory_batch($1)',['good-batch']);
 await db.exec('set role anon');assert.equal((await db.query('select * from people')).rows.length,0);assert.equal((await db.query('select * from burials')).rows.length,0);await db.exec('reset role');
 await assert.rejects(publish('good-batch',[record]));
 }finally{await db.close();}
});
