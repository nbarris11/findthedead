import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {postgis} from '@electric-sql/pglite-postgis';
import {canonicalBounds,summaryFromPeople,mapFeatures} from '../src/lib/explore/map-summary.ts';
import type {DiscoveryPerson} from '../src/types/database.ts';

test('map summary counts beyond 200/1000, paginates every name and respects RLS/filters',async()=>{
 const db=await PGlite.create({extensions:{postgis}});
 try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for(const name of readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  await db.exec(`insert into cemeteries(id,slug,name,country,status,location) values('00000000-0000-4000-8000-000000000001','map-test','Test cemetery','US','published',extensions.st_setsrid(extensions.st_makepoint(-77,39),4326));
   insert into people(slug,name,short_description,death_year,status,is_fixture,dead_score) select 'test-'||n,'Test '||n,'Test',2000,case when n>1200 then 'draft'::publication_status else 'published'::publication_status end,n>1200 and n<=1205,case when n<=10 then 90 else 0 end from generate_series(1,1210) n;
   insert into burials(person_id,cemetery_id,location_precision) select id,'00000000-0000-4000-8000-000000000001','cemetery' from people;
   set role anon;`);
  const summary=(await db.query<{v:{total:number;points:{count:number}[]}}>(`select map_summary(-180,-90,180,90) v`)).rows[0].v;
  assert.equal(summary.total,1200);assert.equal(summary.points.length,1);assert.equal(summary.points[0].count,1200);
  assert.equal((await db.query<{v:{total:number}}>('select map_summary(-180,-90,180,90,80) v')).rows[0].v.total,10);
  assert.equal((await db.query<{v:{total:number}}>("select map_summary(-180,-90,180,90,0,'missing') v")).rows[0].v.total,0);
  const seen=new Set<string>();let after:string|null=null;
  for(;;){const rows: {id:string}[]=(await db.query<{id:string}>('select * from map_people_page(-77.001,38.999,-76.999,39.001,0,null,$1)',[after])).rows;for(const p of rows.slice(0,50)){assert.ok(!seen.has(p.id));seen.add(p.id);}if(rows.length<51)break;after=rows[49].id;}
  assert.equal(seen.size,1200);
  await db.exec("reset role; update cemeteries set status='draft'; set role anon;");
  assert.equal((await db.query<{v:{total:number}}>('select map_summary(-180,-90,180,90) v')).rows[0].v.total,0);
  await db.exec("reset role; update cemeteries set status='published'; set role anon;");
  await assert.rejects(db.query('select map_summary(-181,0,180,10)'));
  assert.equal((await db.query<{v:{total:number}}>('select map_summary(170,-10,-170,10) v')).rows[0].v.total,0);
 } finally {await db.close();}
});

test('map counts represent people rather than marker count and normalize wrapped worlds',()=>{
 const p={latitude:39,longitude:-77} as DiscoveryPerson;
 const s=summaryFromPeople(Array(1084).fill(p));assert.equal(s.points.length,1);assert.equal(s.total,1084);assert.equal(mapFeatures(s.points).features[0].properties.count,1084);
 assert.deepEqual(canonicalBounds({west:-200,east:200,south:-85,north:85}),{west:-180,east:180,south:-85,north:85});
 assert.deepEqual(canonicalBounds({west:170,east:190,south:0,north:10}),{west:170,east:-170,south:0,north:10});
});
