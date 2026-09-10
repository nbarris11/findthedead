import test from 'node:test';
import assert from 'node:assert/strict';
import {directoryIdentityHolds,directoryBatchSchema,directoryBatchSql,ARLINGTON_DISCLAIMER} from '../src/lib/ingestion/directory-batch.ts';
import type {DirectoryEntity} from '../src/lib/ingestion/directory-batch.ts';
const statement=(value:unknown)=>({rank:'normal',mainsnak:{datavalue:{value}}});
const date=(time:string,precision=11)=>statement({time,precision,calendarmodel:'http://www.wikidata.org/entity/Q1985727',before:0,after:0});
const entity:DirectoryEntity={id:'Q1',labels:{en:{value:'Jane Smith'}},claims:{P31:[statement({id:'Q5'})],P119:[statement({id:'Q216344'})],P569:[date('+1900-02-03T00:00:00Z')],P570:[date('+1980-04-05T00:00:00Z')]}};
const source={name:'Jane Smith',birth_year:1900,death_year:1980,birth_date:'1900-02-03',death_date:'1980-04-05'};
test('documentary identity gates retain date precision, qualifier and alias conflicts',()=>{
 assert.deepEqual(directoryIdentityHolds(entity,source),[]);
 assert.deepEqual(directoryIdentityHolds({...entity,claims:{...entity.claims,P119:[{...statement({id:'Q216344'}),qualifiers:{P965:[],P625:[],P585:[]}}]}},source),[]);
 assert.ok(directoryIdentityHolds(entity,{...source,birth_date:'1900-02-04'}).includes('P569_day_conflict'));
 for(const P119 of [[],[statement({id:'Q2'})],[{...statement({id:'Q216344'}),qualifiers:{P582:[]}}]])assert.ok(directoryIdentityHolds({...entity,claims:{...entity.claims,P119}},source).includes('burial_claim_conflict_or_qualifier'));
 assert.ok(directoryIdentityHolds({...entity,claims:{...entity.claims,P569:[date('+1900-01-01T00:00:00Z',8)]}},source).includes('P569_precision_or_qualifier'));
 assert.ok(directoryIdentityHolds({...entity,labels:{en:{value:'Jane A Smith'}}},source).includes('entity_label_mismatch'));
});
test('directory batch excludes fabricated editorial fields and escapes SQL literals',()=>{
 const record={wikidata_id:'Q1',slug:'jane-smith',name:"Jane O'Smith",birth_year:1900,death_year:1980,wikipedia_url:null,cemetery_id:'00000000-0000-4000-8000-000000000001',provider:'arlington',source_record_id:'arlington:1:2',source_url:'https://wspublic.eiss.army.mil/IssRetrieveServices.svc/search?q=CemeteryId%3D46%2CISS_ID%3D1&sortColumn=ISS_ID&sortOrder=asc',source_sha256:'a'.repeat(64),retrieved_at:new Date().toISOString(),section:'1',grave:'2',disclaimer:ARLINGTON_DISCLAIMER};
 const batch={policy:'arlington-directory-v1',batch_id:'test-batch',records:[record]};
 assert.ok(directoryBatchSql(batch).includes("Jane O''Smith"));
 assert.throws(()=>directoryBatchSchema.parse({...batch,records:[record,record]}));
 assert.throws(()=>directoryBatchSchema.parse({...batch,records:[{...record,confirmed:true}]}));
 assert.throws(()=>directoryBatchSchema.parse({...batch,records:[{...record,source_url:record.source_url.replace('ISS_ID%3D1','ISS_ID%3D99')}]}));
});
