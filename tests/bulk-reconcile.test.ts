import test from 'node:test';
import assert from 'node:assert/strict';
import {createReconciler,createCemeteryResolver,groupReconciledLeads} from '../src/lib/ingestion/bulk-reconcile.ts';
import type {ReconcileCandidate,SourceEvidence} from '../src/lib/ingestion/bulk-reconcile.ts';
const person:ReconcileCandidate={wikidata_id:'Q1',name:'Jane Smith',slug:'jane-smith',wikipedia_url:null,review_flags:[],burial_claims:[{birth_year:1900,death_year:1980,birth_date:'1900-02-03',death_date:'1980-04-05',burial_place_wikidata_id:'Q2',burial_place_name:'Test Cemetery',burial_place_latitude:40,burial_place_longitude:-80}]};
const source:SourceEvidence={provider:'arlington',record_id:'1:2',name:'Jane Smith',birth_year:1900,death_year:1980,birth_date:'1900-02-03',death_date:'1980-04-05',cemetery_id:'Q2',cemetery_name:'Test Cemetery',source_url:'https://example.com',source_sha256:'a'.repeat(64),snapshot_file:'page.json',retrieved_at:'2026-09-09T00:00:00Z',section:'1',grave:'2',holds:['memorial_status_unknown']};
test('lifespans distinguish namesakes but do not authorize publication',()=>{
 const other={...person,wikidata_id:'Q3',burial_claims:[{...person.burial_claims[0],birth_year:1800,death_year:1880}]};
 const leads=createReconciler([person,other])(source);assert.equal(leads.length,1);assert.equal(leads[0].candidate_id,'Q1');
 const [group]=groupReconciledLeads(leads);assert.equal(group.publication_approved,false);assert.ok(group.holds.includes('current_interment_requires_review'));
});
test('same-lifespan collisions and exact-day conflicts cannot enter exact identity bucket',()=>{
 const leads=createReconciler([person,{...person,wikidata_id:'Q3'}])(source);assert.ok(leads.every(l=>l.holds.includes('candidate_lifespan_collision')));
 assert.ok(groupReconciledLeads(leads).every(g=>g.bucket==='conflict_review'));
 assert.equal(groupReconciledLeads(createReconciler([person])({...source,birth_date:'1900-02-04'}))[0].bucket,'conflict_review');
});
test('middle-name variation is surfaced without silently approving an alias',()=>{
 const leads=createReconciler([person])({...source,name:'Jane A Smith'});assert.equal(leads[0].identity,'name_variant_and_lifespan');assert.equal(groupReconciledLeads(leads)[0].bucket,'name_variant_review');
 assert.equal(createReconciler([person])({...source,name:'J Smith'}).length,0);
});
test('cemetery mapping requires name, proximity, and unambiguous entity',()=>{
 const resolve=createCemeteryResolver([person]);assert.equal(resolve('TEST CEMETERY',[-80,40]),'Q2');assert.equal(resolve('Test Cemetery'),null);assert.equal(resolve('Test Cemetery',[-81,40]),null);
 const ambiguous={...person,burial_claims:[{...person.burial_claims[0],burial_place_wikidata_id:'Q4'}]};assert.equal(createCemeteryResolver([person,ambiguous])('Test Cemetery',[-80,40]),null);
});
test('repeat source interments stay visible, and known public people are separated',()=>{
 const reconcile=createReconciler([person]);const leads=[...reconcile(source),...reconcile({...source,record_id:'1:3'})];const [g]=groupReconciledLeads(leads,new Set(['Q1']));assert.equal(g.bucket,'already_public');assert.ok(g.holds.includes('multiple_arlington_records'));assert.equal(g.evidence.length,2);
});
