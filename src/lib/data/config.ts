import { z } from "zod";
export function dataConfig(env: Record<string, string | undefined>) {
  const mode = z
    .enum(["demo", "supabase"])
    .parse(
      env.DATA_MODE ?? (env.NODE_ENV === "production" ? "supabase" : "demo"),
    );
  if (mode === "demo") {
    // NODE_ENV=production is set by `next build`/`next start` on any host —
    // Vercel, Netlify, or otherwise — unlike a platform-specific env var,
    // which would silently stop guarding the moment the app moved hosts.
    if (env.NODE_ENV === "production")
      throw new Error("Demo data is disabled on production deployments");
    return { mode } as const;
  }
  const url = z.url().parse(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!["http:", "https:"].includes(new URL(url).protocol))
    throw new Error("Supabase URL must use HTTP(S)");
  const key = z
    .string()
    .min(1)
    .parse(
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  return { mode, url, key } as const;
}
