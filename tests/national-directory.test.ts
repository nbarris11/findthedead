import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';import {postgis} from '@electric-sql/pglite-postgis';import {nationalBatchSchema,nationalBatchSql} from '../src/lib/ingestion/national-directory.ts';
const place={wikidata_id:'Q100',slug:'test-cemetery-q100',name:'Test cemetery',latitude:39,longitude:-77,state:'Virginia',retrieved_at:new Date().toISOString(),source_sha256:'a'.repeat(64)};
const person={wikidata_id:'Q101',slug:'test-person-q101',name:'Test Person',cemetery_wikidata_id:'Q100',birth_year:null,death_year:null,retrieved_at:new Date().toISOString(),source_sha256:'b'.repeat(64)};
test('national listing transactions preserve tiers, reuse cemeteries, reject conflicts, and withdraw atomically',async()=>{
 const db=await PGlite.create({extensions:{postgis}});try{await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');for(const name of readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 const b={policy:'wikidata-listing-v1',batch_id:'national-test-one',places:[place],records:[person]};
 assert.throws(()=>nationalBatchSchema.parse({...b,records:[{...person,cemetery_wikidata_id:'Q999'}]}));
 await db.exec(nationalBatchSql(b));await db.exec(nationalBatchSql(b));assert.equal((await db.query('select * from people')).rows.length,1);
 await db.exec(nationalBatchSql({...b,batch_id:'national-test-two',records:[{...person,wikidata_id:'Q102',slug:'second-q102'}]}));assert.equal((await db.query('select * from cemeteries')).rows.length,1);
 await assert.rejects(db.exec(nationalBatchSql({...b,batch_id:'national-duplicate'})));await db.exec('rollback');
 const broken=nationalBatchSql({...b,batch_id:'national-rollback',records:[{...person,wikidata_id:'Q103',slug:'third-q103'},{...person,name:'Broken',wikidata_id:'Q104',slug:'fourth-q104'}]}).replace('"name":"Broken"','"name":""');
 await assert.rejects(db.exec(broken));await db.exec('rollback');
 assert.equal((await db.query('select * from people')).rows.length,2);
 await db.exec('set role anon');const rows=(await db.query<{profile_tier:string;record_details:{disposition:string}}> ('select * from discovery_people join people using(id)')).rows;assert.equal(rows.length,2);assert.ok(rows.every(r=>r.profile_tier==='wikidata_listing'));await assert.rejects(db.query('select * from private.wikidata_listing_batches'));await db.exec('reset role');
 await db.query("select private.withdraw_wikidata_listing_batch('national-test-two')");await db.exec('set role anon');assert.equal((await db.query('select * from people')).rows.length,1);await db.exec('reset role');
 }finally{await db.close();}
});
