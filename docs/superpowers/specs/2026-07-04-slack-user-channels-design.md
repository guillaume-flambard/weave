# Spec — Ingest des canaux du user Slack connecté (user token)

**Date:** 2026-07-04 · **Statut:** validé (brainstorm) · **Périmètre:** OAuth Slack + connecteur + ingest.

## But
Quand un utilisateur (ex. Cyril @Pennylane) connecte son Slack, Weave ingère **ses propres
canaux** automatiquement — sans inviter de bot, sans canal hardcodé. Ses vraies conversations
deviennent des faits → skills → agents. Multi-tenant (chaque user, ses canaux).

## Décisions (brainstorm)
- **User token** (OAuth `user_scope`) : lit les canaux où l'utilisateur est membre, sans
  invitation. Remplace le `SLACK_CHANNEL` hardcodé + le bot token pour l'ingest.
- Découverte dynamique des canaux, bornée (défaut 15 canaux × 50 messages).

## Composants

### 1. OAuth — user_scope + capture du user token
- `SlackConfig` gagne `user_scopes: String` (env `SLACK_USER_SCOPES`, défaut
  `channels:history,channels:read,groups:history,users:read`).
- `authorize` ajoute `&user_scope={user_scopes}` à l'URL Slack (le `scope` bot reste inchangé).
- `parse_oauth_response` : capturer `authed_user.access_token` (user token `xoxp-`). Le
  `OauthTokens.access_token` stocké devient le **user token** quand présent ; repli sur le bot
  `access_token` sinon. `scopes` = `authed_user.scope` si présent, sinon `scope`. `team_id`
  inchangé (`team.id`).
- Config Slack app : ajouter ces **User Token Scopes** (api.slack.com → OAuth & Permissions).
  Cyril **reconnecte** pour accorder le user token.

### 2. Connecteur — découverte + multi-canal (`weave-ingest/src/slack.rs`)
- `SlackConnector::discover_channels(&self) -> anyhow::Result<Vec<String>>` :
  `users.conversations` (`types=public_channel,private_channel`, `exclude_archived=true`,
  `limit=200`) → parse les `id` des canaux (membre). Plafonné à `max_channels`.
- `SlackConnector::poll_all(&self) -> anyhow::Result<Vec<Event>>` : `discover_channels` puis,
  pour chaque canal, `conversations.history` (`limit=max_messages`) → `parse_history` ; agrège.
  **Best-effort par canal** : une erreur sur un canal (ex. `not_in_channel`) est loggée et
  n'interrompt pas les autres.
- `SlackConnector::new(token, channel, project)` conservé (chemin 1-canal, tests). Ajout d'un
  constructeur/champs `max_channels` (défaut 15) et `max_messages` (défaut 50), configurables
  via env `SLACK_MAX_CHANNELS` / `SLACK_MAX_MESSAGES`.
- Helper pur `parse_channel_ids(resp: &Value) -> Vec<String>` (testé unitaire).

### 3. `ingest_slack` (weave-api)
- Résout le token (connexion stockée `ensure_fresh` → repli `SLACK_BOT_TOKEN`), inchangé.
- Si `SLACK_CHANNEL` défini → 1 canal (override, comme aujourd'hui).
- Sinon → `SlackConnector` en mode multi-canal → `poll_all()`.
- Aucun token → `not_configured`. Réponse : `{status:"ingesting", source:"slack", events:n, channels:k, project}`.

## Flux
Cyril connecte Slack (user_scope) → user token chiffré stocké → clic **Synchroniser** →
`ingest_slack` → `discover_channels` (ses canaux) → `poll_all` (history par canal) → events →
pipeline (extract → facts dédupliqués → skills → thèmes → agents) → agents de SES conversations.

## Erreurs
Best-effort par canal (skip + log). Token/scopes manquants → réponse `not_configured` claire.
Découverte échoue (scope absent) → log + 0 canal → l'UI montre 0 (pas de crash).

## Tests (offline, DB fraîche/serial où besoin)
- `parse_channel_ids` : réponse `users.conversations` → ids ; réponse vide → `[]`.
- `poll_all` (wiremock) : `users.conversations` (2 canaux) + `conversations.history` par canal
  → events agrégés des 2. Un canal renvoyant une erreur Slack → events de l'autre seulement.
- `parse_oauth_response` : réponse avec `authed_user.access_token` → user token capturé ;
  sans → repli bot `access_token`.
- Gate : clippy 0 warn ; suite serial.

## Ripple
`SlackConfig` (+user_scopes) ; `authorize` (user_scope) ; `parse_oauth_response` (authed_user) ;
`SlackConnector` (discover_channels/poll_all/parse_channel_ids/caps) ; `ingest_slack`. Config Slack
app (User Token Scopes) + reconnexion.

## Hors-périmètre
- Sélecteur de canaux UI (on fait auto). Threads/replies profonds (history simple suffit).
- Pagination au-delà des plafonds.
