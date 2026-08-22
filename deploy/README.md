# Deploy — weave-api (autonomous)

The `weave-web` frontend and `weave-postgres` (pgvector) run on the shared Docker
network `coolify`. The API was missing, so `weave.memolabs.dev` returned HTTP 500
(the frontend proxies `/weave-api/*` to `http://weave-api:8787`).

This deploy is **code-managed over SSH**, no control-plane UI. It runs the API as
a Compose service named `weave-api` on the `coolify` network, connected to Postgres
by its `weave-postgres` alias. It becomes an Ansible role verbatim later.

## Files

- `weave-api.compose.yml` — the service (built from `Dockerfile.api`).
- `weave-api.service` — systemd unit: builds and starts the service, restarts on boot.
- `redeploy.sh` — pull latest `main`, rebuild, restart, health-check.

## First install (once, as root)

```bash
git clone https://github.com/guillaume-flambard/weave.git /opt/weave
cd /opt/weave
cp .env.example .weave-api.env && chmod 600 .weave-api.env
# set at minimum: WEAVE_ENC_KEY (openssl rand -base64 32),
# DATABASE_URL=postgres://weave:weave@weave-postgres:5432/weave,
# WEAVE_API_ADDR=0.0.0.0:8787, WEAVE_LLM_PROVIDER=heuristic
install -m 644 deploy/weave-api.service /etc/systemd/system/weave-api.service
systemctl daemon-reload
systemctl enable --now weave-api
```

## Redeploy (on every change)

```bash
ssh root@<host> /opt/weave/deploy/redeploy.sh
```

## Verify

```bash
curl -s https://weave.memolabs.dev/weave-api/health
# {"database":"ok","llm":"...","service":"weave","status":"ok"}
```

## Notes

- Secrets stay in `/opt/weave/.weave-api.env` (chmod 600), never committed.
- `WEAVE_ENC_KEY` encrypts OAuth tokens at rest — keep it stable across redeploys.
- LLM provider defaults to `heuristic` (no key). Set `WEAVE_LLM_PROVIDER=groq` and
  `GROQ_API_KEY` for real LLM answers.
- The network is currently `coolify` because the frontend and database live there.
  If the host moves off Coolify, change the external network name in
  `weave-api.compose.yml` and the frontend's `WEAVE_API_PROXY` to match.
