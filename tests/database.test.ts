import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";

test("migrations, seeds, spatial queries and RLS execute on PostgreSQL/PostGIS", async (t) => {
  const db = await PGlite.create({ extensions: { postgis } });
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls;",
    );
    for (const name of readdirSync(
      new URL("../supabase/migrations/", import.meta.url),
    )
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      await db.exec(
        readFileSync(
          new URL(`../supabase/migrations/${name}`, import.meta.url),
          "utf8",
        ),
      );
    }
    const seed = readFileSync(
      new URL("../supabase/seed.sql", import.meta.url),
      "utf8",
    );
    await db.exec(seed);
    await db.exec(seed);
    await t.test(
      "seed is rerunnable with all source relationships",
      async () => {
        const { rows } = await db.query<{
          people: number;
          burials: number;
          sources: number;
        }>(
          "select (select count(*)::int from people) people,(select count(*)::int from burials) burials,(select count(*)::int from sources) sources",
        );
        assert.deepEqual(rows[0], { people: 22, burials: 22, sources: 46 });
      },
    );
    await t.test(
      "all application tables use RLS and spatial indexes exist",
      async () => {
        const { rows } = await db.query<{
          relname: string;
          relrowsecurity: boolean;
        }>(
          "select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'",
        );
        assert.equal(rows.length, 8);
        assert.ok(rows.every((r) => r.relrowsecurity));
        const indexes = await db.query(
          "select indexname from pg_indexes where schemaname='public' and indexdef ilike '%using gist%'",
        );
        assert.equal(indexes.rows.length, 5);
      },
    );
    await t.test(
      "anonymous access cannot see development records or their sources",
      async () => {
        await db.exec("set role anon");
        for (const table of [
          "people",
          "burials",
          "cemeteries",
          "sources",
          "person_categories",
          "discovery_people",
        ])
          assert.equal(
            (await db.query(`select * from public.${table}`)).rows.length,
            0,
          );
        assert.equal(
          (await db.query("select * from public.nearby_people(42.44,-83.12)"))
            .rows.length,
          0,
        );
        await assert.rejects(
          db.exec(
            "insert into public.categories(slug,name) values ('attack','Attack')",
          ),
          /permission denied/,
        );
        await db.exec("reset role");
      },
    );
    await t.test(
      "constraints reject invented precision, invalid scores and duplicate primary burials",
      async () => {
        await assert.rejects(
          db.exec("update public.burials set location_precision='exact_grave'"),
          /check constraint/,
        );
        await assert.rejects(
          db.exec("update public.people set dead_score=101"),
          /check constraint/,
        );
        await assert.rejects(
          db.exec("update public.people set status='published'"),
          /check constraint/,
        );
        await assert.rejects(
          db.exec(
            "insert into public.burials(person_id) select id from public.people limit 1",
          ),
          /unique constraint/,
        );
      },
    );
    await t.test(
      "spatial and access smoke tests pass in a rolled-back transaction",
      async () => {
        await db.exec(
          readFileSync(
            new URL("../supabase/tests/discovery.sql", import.meta.url),
            "utf8",
          ),
        );
      },
    );
    await t.test(
      "SQL rejects invalid coordinates, NaN, unlimited scans and reversed bounds",
      async () => {
        for (const sql of [
          "select * from public.nearby_people(91,0)",
          "select * from public.nearby_people('NaN',0)",
          "select * from public.nearby_people(0,0,null)",
          "select * from public.nearby_people(0,0,100,0,null,201)",
          "select * from public.people_in_bounds(0,20,10,10)",
          "select * from public.cemeteries_in_bounds(0,-20,10,10,0)",
        ])
          await assert.rejects(db.exec(sql), /Invalid/, sql);
      },
    );
  } finally {
    await db.close();
  }
});
