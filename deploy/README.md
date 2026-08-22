# Deploy

## weave-api as a Coolify resource

The frontend (`weave-web`) and database (`weave-postgres`, pgvector) already run
as separate Coolify resources in the `memo-labs` / `production` project. The API
was missing, so `weave.memolabs.dev` returned HTTP 500. `deploy/coolify-weave-api.yml`
adds only the API, on the shared `coolify` network with the alias `weave-api` that
the frontend proxies to.

### Create the resource in Coolify

1. Project `memo-labs`, environment `production` → **New Resource** → **Docker Compose**.
2. Source: this repo (`guillaume-flambard/weave`), branch `main`.
3. Compose file path: `deploy/coolify-weave-api.yml`.
4. Environment Variables:
   - `WEAVE_ENC_KEY` — generate once with `openssl rand -base64 32` and keep it stable
     (it encrypts OAuth tokens at rest; changing it invalidates stored tokens).
   - `WEAVE_LLM_PROVIDER` — `heuristic` (no key) by default; set `groq` plus `GROQ_API_KEY`
     for real LLM answers.
5. Deploy. Coolify builds `Dockerfile.api` and starts the service as `weave-api`.

Once it is up, remove any manually created `weave-api` container so only the
Coolify-managed one remains:

```bash
docker rm -f weave-api   # only the ad-hoc one; the Coolify service keeps its own name
```

### Verify

```bash
curl -s https://weave.memolabs.dev/weave-api/health
# {"database":"ok","llm":"...","service":"weave","status":"ok"}
```

## Full stack (alternative)

`docker-compose.prod.yml` describes the entire stack (postgres + api + web) on its
own isolated network, for a single-resource deploy or a non-Coolify host. It is not
used by the split Coolify setup above.
