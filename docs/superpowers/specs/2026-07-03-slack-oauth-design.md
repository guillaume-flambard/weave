# Chantier 4 — OAuth Slack + stockage token chiffré

**Date** : 2026-07-03
**Statut** : spec validée, prêt pour plan
**Arc** : live-OAuth, chantier 4/5 (3 fait, 5 = UI connect, 2 = register apps, 1 = deploy)

## But

Remplacer le token Slack statique-en-env par un vrai flow OAuth avec tokens
chiffrés en base. Localhost d'abord. Démo Cyril/PennyLane : connecter un vrai
workspace Slack via consentement navigateur, tokens jamais en clair.

L'app Slack "Demo App" (App ID `A0BF64Y2CN8`) est déjà enregistrée : Client ID,
Client Secret, Signing Secret disponibles. Tokens de test (access + refresh)
déjà émis. Donc chantier 4 est testable en vrai cette session.

## Décisions clés

- **Slack seulement** ce chantier. Notion réutilisera le core OAuth plus tard.
- **Full wiring** : authorize-redirect + callback + token exchange réels contre
  les endpoints Slack. Tests auto contre un serveur OAuth mocké (pas de réseau,
  pas de secret en CI, pas de clic humain).
- **Refresh conditionnel à `expires_at`** : gère token rotatif ET statique sans
  config. Si expiry présent et dépassé → refresh ; si NULL → jamais.
- **Single-tenant** : cohérent avec `DEFAULT_PROJECT = "pennylane"`. Pas de
  multi-org. `team_id` stocké mais une connexion active par provider suffit MVP.

## Architecture

### 1. Migration `migrations/0005_connections.sql`

```sql
CREATE TABLE connections (
    provider      text        NOT NULL,
    team_id       text        NOT NULL,
    access_token  bytea       NOT NULL,   -- nonce ‖ AEAD ciphertext
    refresh_token bytea,                  -- nullable (rotation off)
    expires_at    timestamptz,            -- nullable (token statique)
    scopes        text        NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, team_id)
);
```

Aucune colonne token en clair. `bytea` = nonce (12 o) concaténé au ciphertext AEAD.

### 2. Chiffrement — `weave-store`, module `crypto`

- Algo : `chacha20poly1305` (crate `chacha20poly1305`, AEAD).
- Clé maître : `WEAVE_ENC_KEY`, 32 octets encodés base64, lu de `.env`.
  Absent → erreur explicite au démarrage (fail fast).
- `encrypt(plaintext: &str) -> Vec<u8>` : nonce aléatoire 12 o (OsRng) ‖ ciphertext.
- `decrypt(blob: &[u8]) -> anyhow::Result<String>` : split nonce, déchiffre,
  erreur si tag AEAD invalide (tamper) ou nonce tronqué.
- Pas d'AAD MVP (peut ajouter provider en AAD plus tard).

### 3. Store — `PgStore`, API connexions

- `upsert_connection(conn: NewConnection)` — chiffre access+refresh, upsert par
  (provider, team_id), bump `updated_at`.
- `get_connection(provider, team_id) -> Option<Connection>` — lit, déchiffre.
- `get_active_connection(provider) -> Option<Connection>` — la plus récente pour
  un provider (single-tenant : ignore team_id côté appelant).
- Types : `NewConnection` (plaintext, entrée), `Connection` (déchiffré, sortie
  interne API — jamais sérialisé vers le client).

### 4. Flow OAuth — `weave-api`, module `oauth`

Config lue de `.env` : `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`,
`SLACK_SIGNING_SECRET`, `SLACK_REDIRECT_URI`
(défaut `http://localhost:8787/oauth/slack/callback`), `SLACK_OAUTH_SCOPES`
(défaut `channels:history,groups:history,users:read`).

- **`GET /oauth/slack/authorize`** → 302 vers
  `https://slack.com/oauth/v2/authorize?client_id=…&scope=…&state=…&redirect_uri=…`.
  `state` = payload `{nonce, exp}` signé HMAC-SHA256 avec `SLACK_SIGNING_SECRET`,
  base64url. Expiry court (~10 min). Pas de stockage serveur du state (stateless,
  vérifié par signature + exp).
- **`GET /oauth/slack/callback?code&state`** :
  1. Vérifie signature `state` + non expiré. Invalide → 400.
  2. `POST https://slack.com/api/oauth.v2.access`
     (`client_id`, `client_secret`, `code`, `redirect_uri`).
  3. Parse `access_token`, `refresh_token` (option), `expires_in` (option),
     `team.id`, `scope`. Pure fn `parse_oauth_response` testable offline.
  4. `expires_at = now + expires_in` si présent, sinon NULL.
  5. `upsert_connection`. Redirige vers page succès simple (ou 200 JSON MVP).

Le token exchange passe par une base URL configurable
(`SLACK_API_BASE`, défaut `https://slack.com/api`) pour pointer le mock en test.

### 5. Refresh — `weave-api`, module `oauth`

`ensure_fresh(conn: Connection) -> Connection` :
- `expires_at` NULL → retourne tel quel (statique, pas de refresh).
- `expires_at` présent et > now + marge (~60 s) → tel quel.
- Sinon → `POST oauth.v2.access` `grant_type=refresh_token` avec
  `client_id`+`client_secret`+`refresh_token` → nouveau access (+ refresh +
  expiry) → `upsert_connection` → retourne rafraîchi.
- Échec refresh → erreur remontée (ingest renvoie 502 explicite).

### 6. Import bridge — testable live sans UI

**`POST /connections/slack/import`** : lit `SLACK_ACCESS_TOKEN` /
`SLACK_REFRESH_TOKEN` de `.env`, valide via `auth.test` Slack (récupère
`team_id`), chiffre + upsert. Donne un end-to-end réel cette session sans
attendre chantier 5.

Règle `expires_at` à l'import : le body accepte un champ optionnel `expires_in`
(secondes). Fourni → `expires_at = now + expires_in` (force la validation du
chemin refresh). Absent → NULL (token traité statique). Un refresh token
présent sans expiry ne déclenche jamais de refresh — cohérent avec la règle §5.
Le vrai flow authorize/callback, lui, renseigne toujours l'expiry via
`expires_in` de la réponse Slack.

### 7. Ingest — `ingest_slack`

Ordre de résolution du token :
1. `get_active_connection("slack")` → `ensure_fresh` → utilise ce token.
2. Sinon repli sur `SLACK_BOT_TOKEN` + `SLACK_CHANNEL` env (démo offline intacte).
3. Sinon `not_configured` (comportement actuel).

`SlackConnector` inchangé (prend un token statique) — la fraîcheur est garantie
en amont par `ensure_fresh`.

## Erreurs

- `WEAVE_ENC_KEY` absent/mal formé → panique au démarrage, message clair.
- State CSRF invalide/expiré → 400.
- Échange OAuth échoue (Slack `ok:false`) → 502 + `error` Slack loggé.
- Déchiffrement échoue (tamper/clé changée) → 500, jamais de token en clair loggé.
- Refresh échoue → 502, connexion laissée en place (pas d'écrasement).

## Tests

- **crypto** : round-trip encrypt/decrypt ; tamper → erreur ; nonce unique.
- **`parse_oauth_response`** : pure, payloads Slack échantillon (avec/sans
  refresh, avec/sans expires_in).
- **state CSRF** : sign→verify OK ; tamper→échec ; expiré→échec.
- **callback + refresh** : serveur OAuth mocké (mockito/wiremock) — code→token,
  refresh_token→nouveau token.
- **store** : upsert puis get round-trip en Postgres (serial, DB propre).
- Gate : **0 warning**, `--test-threads=1` + DB propre (dette connue documentée).

## Hors-scope (chantiers suivants)

- UI connect réelle (bouton "Connect Slack") → chantier 5.
- OAuth Notion (réutilise module `oauth` + `connections`) → après.
- Déploiement domaine public + redirect URI HTTPS → chantier 1.
- Multi-tenant / plusieurs workspaces par provider.

## Dépendances nouvelles

- `chacha20poly1305` (weave-store)
- `base64` (si pas déjà présent)
- `hmac` + `sha2` (state CSRF ; sha2 possiblement déjà transitif)
- `mockito` ou `wiremock` en dev-dependency (tests OAuth)

## Config `.env` à ajouter

```
WEAVE_ENC_KEY=<32 octets base64>
SLACK_CLIENT_ID=…
SLACK_CLIENT_SECRET=…
SLACK_SIGNING_SECRET=…
SLACK_REDIRECT_URI=http://localhost:8787/oauth/slack/callback
SLACK_OAUTH_SCOPES=channels:history,groups:history,users:read
SLACK_ACCESS_TOKEN=…   # bridge import
SLACK_REFRESH_TOKEN=…  # bridge import
```
