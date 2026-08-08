# Run log — weave (superflow T3 baseline, 2026-08-08)

| check | result |
|---|---|
| git | yes (+ .jj) |
| last commit | 2026-07-07 6f41f6a fix(web): send SSE api key via header, not query string (#8) |
| working tree | 3 uncommitted (M .gitignore, ?? docs/pitch/, ?? tools/video) · target+node_modules ignored: yes |
| tooling | test:cargo test lint:cargo clippy typecheck:cargo check build:cargo build (+ web app) |
| deps | Cargo.lock + workspace Cargo.toml (target/ absent → not built); apps/web node_modules absent |
| gates run | none (no deps — cargo check would write target/ and exceed 60s) |
| verdict | pending |
| debt | 3 uncommitted files: modified .gitignore, untracked docs/pitch/ (pitch briefs) + tools/video |
