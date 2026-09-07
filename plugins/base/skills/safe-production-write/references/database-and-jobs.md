# Database and job checks

## Before a destructive query

Inspect the **connected live schema**, not a remembered schema, an old migration,
or a similarly named staging table. Use the engine's catalog or schema inspection
tools to establish:

1. Actual database/schema, table names and prefixes, columns, primary keys, and
   foreign keys, including cascade behavior and triggers.
2. How the application assigns object types. An integer ID can refer to different
   kinds of records in different tables; a column named `object_id` does not prove
   it identifies a post, user, or customer. When the database does not enforce the
   relation, inspect the application mapping and representative joined rows.
3. The exact target IDs and conditions. Preview a `SELECT` with the same joins
   and conditions as the proposed mutation. Inspect unexpected types, orphans,
   duplicates, and both expected and unexpected matches.
4. A recoverable before-state. Use the project's secure backup/export process for
   affected rows and dependent data, and confirm it can support the proposed
   recovery. Do not print private row dumps or put them in Git.
5. Which operations are transactional on this engine and storage configuration.
   Account for external hooks and side effects that database rollback cannot undo.

For WordPress taxonomy cleanup, verify the actual table prefix, taxonomy and
term-taxonomy identity, registered object types, and the application's relation
to `term_relationships.object_id`. Do not join every matching integer to posts
and then delete rows without proving that those IDs mean posts for this taxonomy.

Use exact approved IDs plus the relevant type/version conditions for execution.
Assert the affected count and inspect the selected row set under the application's
transaction or conditional-update mechanism. If preconditions change, stop before
committing and rebuild the plan. Broad cleanup, cascading deletes, or a different
set of IDs needs its own scope decision; matching the old count is not enough.

Do not generate a generic ready-to-run `DELETE` until these facts are known.
The correct SQL depends on the engine and schema. For PostgreSQL, consult the
[constraint catalog](https://www.postgresql.org/docs/current/catalog-pg-constraint.html)
and [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).
For WordPress, inspect the application's use of
[registered taxonomy object types](https://developer.wordpress.org/reference/functions/register_taxonomy/).

## Before concurrent imports or retries

Find every writer of the same work: scheduled jobs, workers, admin actions, CLI
imports, and retries. Identify the stable application key for one intended result.
Inspect whether the write route enforces it atomically. A unique constraint,
transactional queue claim, or application lock must cover all competing routes.
An in-memory flag or a lock used only by the manual script does not stop cron.

Reuse the existing claim or approval queue. Confirm what happens on a retry,
including emails and external requests. For PostgreSQL,
[`INSERT ... ON CONFLICT`](https://www.postgresql.org/docs/current/sql-insert.html)
can use a real unique constraint; adding those words to a statement does not
establish the correct application key or make external side effects idempotent.

If the application lacks coordination, prepare a focused fix or an authorized
maintenance procedure. Verify the same mechanism in every writer before relying
on it. Do not invent a lock in the plan and then run an unprotected production
command. Job pauses, schedule changes, and resumption must follow the actual
authorized scope and be verified, including any pre-existing paused state.

For an uncertain response, inspect the operation ID, queue state, and persisted
result before deciding whether retry is safe. The preview and a zero exit code
are not proof that no duplicate or partial operation occurred.
