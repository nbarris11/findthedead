/** One shared classification query replaces per-person cemetery lookups. */
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';import {createHash} from 'node:crypto';
const root='data/ingestion-runs/us-national/national-directory';mkdirSync(root,{recursive:true});const file=root+'/cemetery-types.json';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
let fresh=false;if(existsSync(file)){const s=JSON.parse(readFileSync(file,'utf8'));fresh=hash(s.body)===s.sha256&&Date.now()-Date.parse(s.retrieved_at)<86400000;}
if(fresh&&!process.argv.includes('--refresh'))console.log('Using checked cemetery classification cache.');
else {
 const query='SELECT DISTINCT ?place ?coord WHERE { ?place wdt:P17 wd:Q30; wdt:P31/wdt:P279* wd:Q39614; wdt:P625 ?coord. }';const url='https://query.wikidata.org/sparql?'+new URLSearchParams({query,format:'json'});
 const response=await fetch(url,{headers:{'User-Agent':'FindTheDead/0.1 (https://findthedead.netlify.app; cemetery classification)','Accept':'application/sparql-results+json'},signal:AbortSignal.timeout(90000)});if(!response.ok)throw new Error('Classification HTTP '+response.status);const body=await response.text();const rows=JSON.parse(body).results.bindings;if(!Array.isArray(rows)||!rows.length)throw new Error('Empty classification');writeFileSync(file,JSON.stringify({retrieved_at:new Date().toISOString(),url,sha256:hash(body),body}));console.log(`${rows.length} cemetery coordinate rows collected.`);
}
