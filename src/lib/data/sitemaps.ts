import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {dataConfig} from './config';
import {publicSiteRecords} from './repository';
export const SITEMAP_SIZE=10000;
function db(){const c=dataConfig(process.env);if(c.mode!=='supabase')return null;return createClient(c.url,c.key,{auth:{persistSession:false,autoRefreshToken:false}});}
export async function sitemapCounts(){const client=db();if(!client){const rows=await publicSiteRecords();return {people:rows.people.length,cemeteries:rows.cemeteries.length};}const result=await Promise.all(['people','cemeteries'].map(table=>client.from(table).select('id',{count:'exact',head:true})));for(const r of result)if(r.error)throw r.error;return {people:result[0].count??0,cemeteries:result[1].count??0};}
export async function sitemapRows(kind:'people'|'cemeteries',page:number){const client=db();if(!client)return (await publicSiteRecords())[kind].slice(page*SITEMAP_SIZE,(page+1)*SITEMAP_SIZE);const all:{slug:string;updated_at:string}[]=[];for(let i=0;i<SITEMAP_SIZE;i+=1000){const r=await client.from(kind).select('slug,updated_at').order('slug').range(page*SITEMAP_SIZE+i,page*SITEMAP_SIZE+i+999);if(r.error)throw r.error;all.push(...r.data);if(r.data.length<1000)break;}return all;}
