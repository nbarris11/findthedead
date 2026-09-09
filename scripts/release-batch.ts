/** Validate a verified batch, stage drafts, then run release guards. */
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { verifiedBatchSchema } from "../src/lib/ingestion/batch.ts";

const path = process.argv[2];
if (!path || path.startsWith("--") || process.argv.slice(3).some((arg) => arg !== "--confirm")) {
  throw new Error("Usage: npm run release:batch -- verified-batch.json [--confirm]");
}
const batch = verifiedBatchSchema.parse(JSON.parse(readFileSync(resolve(path), "utf8")));
console.log(`Validated ${batch.candidates.length} reviewed profiles by ${batch.reviewer}.`);
console.log(`Tags: ${[...new Set(batch.candidates.flatMap((p) => p.categories))].join(", ")}`);
if (!process.argv.includes("--confirm")) {
  console.log("Validation only. No database writes. Add --confirm to stage and publish this exact batch.");
} else {
  if (process.env.DATA_MODE !== "supabase" || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL)
    throw new Error("Release requires server-side Supabase configuration; no records were written");
  // Both phases use one validated snapshot even if the original file changes.
  const directory = mkdtempSync(join(tmpdir(), "findthedead-reviewed-"));
  const snapshot = join(directory, "batch.json");
  try {
    writeFileSync(snapshot, JSON.stringify(batch), { mode: 0o600 });
    for (const script of ["publish-reviewed-candidates.ts", "release-reviewed-candidates.ts"]) {
      const result = spawnSync(process.execPath, ["--experimental-strip-types", resolve("scripts", script), snapshot, "--confirm"], { stdio: "inherit", env: process.env });
      if (result.error || result.status !== 0) throw new Error(`${script} failed; release stopped. Existing drafts may remain for repair.`, { cause: result.error });
    }
    console.log(`Verified batch released: ${batch.candidates.length} profiles. Public API/filter checks should follow.`);
  } finally {
    rmSync(snapshot, { force: true });
    rmSync(directory, { recursive: true });
  }
}
