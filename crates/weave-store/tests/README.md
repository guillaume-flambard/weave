# Postgres integration tests

These tests exercise the concrete `PgStore` adapter against a real Postgres instance.

## Run

```bash
export TEST_DATABASE_URL="postgres://weave:weave@localhost:5433/weave"
cargo test -p weave-store --test postgres_integration
```

If `TEST_DATABASE_URL` is not set (or the database is unavailable), the tests exit early and print a skip message.

## Notes

- The tests run the embedded migrations via `PgStore::migrate()`.
- Each test uses a unique `project` value so data stays scoped and isolated.
- The database must have the `pgvector` extension available because the app migrations create it.
