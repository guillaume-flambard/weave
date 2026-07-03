# Résumé — Chantier 4 : OAuth Slack + tokens chiffrés (2026-07-03)

**Livré sur branche `feat/slack-oauth` (`d4f00ba..ee90524`, 7 commits).** Revue whole-branch (opus) : **READY TO MERGE**, 0 Critical/Important.

## Fait
Vrai flow OAuth Slack, tokens **chiffrés en base**, refresh automatique. Remplace le token Slack statique-en-env.

- **Cipher** (`weave-store/src/crypto.rs`) : ChaCha20-Poly1305 AEAD, clé maître `WEAVE_ENC_KEY` (32 o base64), nonce 12 o aléatoire ‖ ciphertext. Fail-fast si clé absente.
- **Table `connections`** (`migrations/0005`) : tokens `bytea` chiffrés, `expires_at` nullable. `upsert_connection`/`get_active_connection` (chiffrent/déchiffrent).
- **Module `oauth`** (`weave-api/src/oauth.rs`) : state CSRF signé HMAC + expiry ; `GET /oauth/slack/authorize` (302 → Slack) ; `GET /oauth/slack/callback` (verify state → `oauth.v2.access` → chiffre → stocke).
- **Refresh** (`ensure_fresh`) : conditionnel à `expires_at`. Statique → jamais ; expiré → refresh via `grant_type=refresh_token`, réécrit chiffré. Gère rotation ON/OFF sans config.
- **Pont import** `POST /connections/slack/import` : seed depuis `SLACK_ACCESS_TOKEN`/`SLACK_REFRESH_TOKEN` env, validé via `auth.test`. Zéro clic navigateur — testable live sans UI.
- **`ingest_slack`** : connexion stockée (refresh à la demande) → repli `SLACK_BOT_TOKEN` env → `not_configured`. Démo offline intacte.

## Vérif live (cette session)
- `POST /connections/slack/import` → `{"status":"imported"}` : **vrai Slack `auth.test`** validé, workspace réel `T04PV4RE3H9`.
- Ligne en base : `access_token` chiffré (208 o, préfixe binaire, **pas** `xoxe.`), refresh présent → **chiffré-au-repos confirmé**.
- Ingest wiring live confirmé (résout le token stocké ; stoppe sur `SLACK_CHANNEL` manquant).

## Méthode
8 tâches, subagent-driven (implementer haiku/sonnet + reviewer sonnet par tâche). Gate : **15 tests / 0 échec / 0 warning** (serial, DB propre). Revue finale opus.

Spec + plan : `docs/superpowers/`.

## Reste
- **Ingest de vrais messages** : besoin d'un **channel id** dont le user/app est membre (token scope `channels:history` OK mais pas `channels:read` → pas de list). Fournir l'ID + `SLACK_CHANNEL`.
- **Chantier 5** : UI connect réelle (bouton "Connect Slack" → `/oauth/slack/authorize`).
- **Notion OAuth** : réutilise module `oauth` + table `connections`.
- **Chantier 1** : déploiement domaine public + redirect URI HTTPS.

## Dettes / follow-ups (non-bloquants, from reviews)
- `verify_state` comparaison HMAC non constant-time → passer à `Mac::verify_slice`/`subtle`. Faible sévérité (garde un redirect CSRF, pas un bearer secret).
- `urlencode` maison (pourrait utiliser crate `url`). Cosmétique.
- Tests Postgres non parallel-safe → `--test-threads=1` + DB propre (dette connue). Test `stats_...` accumule des rows sur DB partagée ; passe sur DB fraîche.
- AAD `provider` dans l'AEAD (spec §2, différé) si la table grossit.

## ⚠️ Sécurité
Secrets Slack (client secret, signing secret, tokens) **exposés dans le transcript** → **REGENERATE tout après la démo** (api.slack.com → boutons Regenerate ; réinstaller l'app pour de nouveaux tokens). `.env` local gitignored contient la config courante.

**Prochain : ingest live (channel id) puis chantier 5 (UI connect).**
