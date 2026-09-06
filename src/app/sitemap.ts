import type { MetadataRoute } from "next";
import { publicSiteRecords } from "@/lib/data/repository";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const records = await publicSiteRecords();

  return [
    { url: site.url },
    ...records.people.map((person) => ({
      url: `${site.url}/people/${person.slug}`,
      ...(person.updated_at && { lastModified: person.updated_at }),
    })),
    ...records.cemeteries.map((cemetery) => ({
      url: `${site.url}/cemeteries/${cemetery.slug}`,
      ...(cemetery.updated_at && { lastModified: cemetery.updated_at }),
    })),
  ];
}
