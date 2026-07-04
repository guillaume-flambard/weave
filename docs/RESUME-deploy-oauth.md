# Résumé — Deploy strayeye.com + OAuth Slack/Notion (2026-07-04)

## Fait
- **Prod live : https://strayeye.com** (Cloudflare orange + Full strict, cert LE réel).
  Stack Docker isolé sur VPS ovh-echo (Forge site `3274925`) : `weave-postgres` (pgvector)
  + `weave-api` (Rust) + `weave-web` (Next). Zéro contact avec echotravel.
  Auto-deploy sur push `main`. Secrets : `/home/forge/weave-secrets/prod.env`.
- **Slack OAuth (chantier 5) bout-en-bout** : bouton Connect Slack → OAuth réel →
  token chiffré au repos (vérifié, 86 o binaire). `GET /connections` = statut live.
  Callback redirige vers l'UI (`?connected/​connect_error`). Bouton Synchroniser séparé.
- **Notion OAuth** : code + routes `/oauth/notion/*` déployés (miroir Slack, token sans
  expiry). Bouton Connect Notion câblé. `503` tant que creds absents.
- Gate : 18 api + 5 store + 4 integ tests / 0 fail / 0 warn (DB fraîche).

## Reste
1. **Creds Notion** → notion.so/my-integrations (Public), redirect
   `https://strayeye.com/weave-api/oauth/notion/callback` → me donner client ID+secret
   → inject `prod.env` + redeploy → tester Connect Notion.
2. **Ingest réel Slack** : besoin `SLACK_CHANNEL` (id d'un canal membre).
3. **Arc produit** : ingest → agents émergents → push auto vers Notion (à designer).
4. Dette : `verify_state` constant-time ; tests Postgres parallel-safe.
