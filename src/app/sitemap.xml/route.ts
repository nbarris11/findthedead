import {sitemapCounts,SITEMAP_SIZE} from '@/lib/data/sitemaps';
import {site} from '@/lib/site';
export const dynamic='force-dynamic';
export async function GET(){const counts=await sitemapCounts();const urls=Object.entries(counts).flatMap(([kind,count])=>Array.from({length:Math.max(1,Math.ceil(count/SITEMAP_SIZE))},(_,i)=>`${site.url}/sitemaps/${kind}/${i}`));return new Response('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>`<sitemap><loc>${url}</loc></sitemap>`).join('')+'</sitemapindex>',{headers:{'content-type':'application/xml','cache-control':'public, max-age=60'}});}
