# Direct database access

The local Supabase CLI is authenticated and linked to Find The Dead
(`ttssyodmfybcadqahfeg`). Verified September 9, 2026 with a read-only SQL query.
Authentication is managed by the Supabase CLI; no service key was placed in the
project, frontend, Git, or handoff. Do not inspect or print credential values.

The Supabase app connector has access to a different organization. Leave that
connection alone; use the working CLI for this project. Browser access is not
needed for routine SQL, migrations or directory publishing.

From `/Users/barris/Documents/ChatGPT/Find The Dead`:

```sh
npm run db:check
supabase db query --linked --file /absolute/path/to/reviewed-query.sql
supabase migration list --linked
supabase db push --dry-run --linked
supabase db advisors --linked --type security --level warn
```

The project link is in ignored `supabase/.temp/project-ref`. Confirm it equals
`ttssyodmfybcadqahfeg` before writes. The directory publisher enforces this check.
If login expires, use the normal `supabase login` flow; do not put a token in a
command, saved report, or chat. New machines need their own login and project link.

## Directory release

```sh
npm run prepare:directory
npm run publish:directory -- /absolute/path/to/batch.json
npm run publish:directory -- /absolute/path/to/batch.json --confirm
```

Preparation reads a complete checksummed Arlington source set, checks unique
source/candidate identities, and retrieves/caches current Wikidata labels,
lifespans and cemetery claims. The first source adapter supports Arlington only.
Documentary grave-reference, coordinate, point-date and media qualifiers are
allowed but do not supply public exact coordinates/days. End dates, unknown
qualifiers, disposition/role qualifiers, conflicting dates and identities remain
held. Published years come from the matching official record. Full profiles use
the separate existing editorial pipeline.

Publication uses one PostgreSQL transaction per batch of up to 200. The private
batch ledger retains immutable payloads and source IDs. Replaying the same batch
is idempotent; changed payloads and duplicate identities are rejected. Source
citations and cemetery relationships are created before any records become public.
The private functions are SECURITY INVOKER and unavailable to public API users.

To withdraw a released directory batch, inspect its ID and execute a reviewed SQL
file containing `select private.withdraw_directory_batch('the-exact-batch-id');`.
Withdrawal makes its records drafts; it does not delete source evidence. A batch
containing a profile subsequently upgraded out of the directory tier is held for
manual repair rather than hidden blindly.

Deploy the record-aware frontend before releasing directory records. Check the
public API, profile wording, source disclaimer, source retrieval date, search,
map results and sitemap after each release. Never describe a directory record
as a confirmed physical interment.


## National listing publisher

The same direct CLI access released 80,538 national listings in 42 set-based
transactions. Use `npm run publish:national -- prepared-directory --confirm`;
read `NATIONAL-LISTINGS.md` for source policies, canary and replay behavior.
The complete-count map and national listing migrations are recorded remotely.
