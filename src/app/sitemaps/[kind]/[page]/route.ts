import {sitemapRows} from '@/lib/data/sitemaps';
import {site} from '@/lib/site';
export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{kind:string;page:string}>}){
 const {kind,page}=await context.params;
 if((kind!=='people'&&kind!=='cemeteries')||!/^\d{1,4}$/.test(page))return new Response('Not found',{status:404});
 const rows=await sitemapRows(kind,Number(page));if(!rows.length&&page!=='0')return new Response('Not found',{status:404});
 const home=kind==='people'&&page==='0'?`<url><loc>${site.url}</loc></url>`:'';
 return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+home+rows.map(row=>`<url><loc>${site.url}/${kind}/${row.slug}</loc>${row.updated_at?`<lastmod>${row.updated_at}</lastmod>`:''}</url>`).join('')+'</urlset>',{headers:{'content-type':'application/xml','cache-control':'public, max-age=60'}});
}
