# Database schema

`schema.sql` is the full DDL for every table every service's routers expect
— hand-written, not generated (see `docs/ARCHITECTURE_PLAN_REWRITE.md`: no
ORM/Alembic in this codebase, every service talks to MySQL with raw SQL).

Run it once against the `cadence` database after creating it:

```bash
mysql -u cadence -p cadence < db/schema.sql
```

If a table's columns ever change in a service's router, update this file to
match — there's no migration tool tracking drift for you.
