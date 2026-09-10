import {z, ZodError} from 'zod';
import {mapSummary,mapPeoplePage} from '@/lib/data/repository';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 const params=new URL(request.url).searchParams;
 const number=(key:string)=>params.has(key)?Number(params.get(key)):undefined;
 const args={west:number('west'),east:number('east'),south:number('south'),north:number('north'),min_score:number('min_score'),category_slug:params.get('category_slug')||null};
 try {
  const data=params.get('view')==='names'?await mapPeoplePage(args,params.has('after')?z.uuid().parse(params.get('after')):null):await mapSummary(args);
  return Response.json(data,{headers:{'cache-control':'no-store'}});
 } catch(error) {
  if(!(error instanceof ZodError))console.error('Map query failed',error);
  return Response.json({error:'Map results could not be loaded.'},{status:error instanceof ZodError?400:500,headers:{'cache-control':'no-store'}});
 }
}
