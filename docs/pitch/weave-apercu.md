# Weave — aperçu technique

Prototype d'une couche de mémoire d'équipe qui fait émerger des compétences
réutilisables à partir de l'activité réelle, avec provenance par couche mémoire.
Ce document décrit le fonctionnement. C'est un prototype, pas un produit fini.

## L'idée

Les questions et décisions d'une équipe se répètent. Weave lit cette activité,
en extrait des faits, repère les sujets qui reviennent, et matérialise une
compétence quand un sujet passe un seuil de récurrence. Personne n'écrit la
compétence à la main. Quand quelqu'un interroge la mémoire, la réponse arrive avec
la liste des faits utilisés, rangés par couche : perso, équipe, projet, organisation.

Aujourd'hui je l'ai branché sur Discord, parce que c'est là que se passe l'activité
de mon équipe en ce moment. Le même pipeline marche pour Slack ou Notion.

## Le flux

1. Ingestion des messages (Discord pour l'instant, Slack et Notion prévus).
2. Extraction de faits atomiques, entités, relations. Déduplication par hash.
3. Détection de patterns : comptage d'occurrences par signature de sujet. Le sujet
   est canonicalisé, donc deux reformulations d'une même question comptent ensemble.
4. Une compétence émerge quand un pattern atteint le seuil (réglable, 3 en démo).
5. Quand un domaine accumule assez de compétences, un agent spécialiste est proposé.
   Il reste en attente d'une validation humaine avant de pouvoir agir.
6. À l'interrogation, la réponse cite sa provenance par couche mémoire.

## Comment marche l'émergence

Pur comptage d'occurrences par sujet, pas de clustering opaque. C'est déterministe
et auditable : on peut expliquer pourquoi une compétence est apparue. La
canonicalisation des sujets (vocabulaire contrôlé) évite que le bruit du texte libre
fragmente les patterns.

## Les couches mémoire

Quatre niveaux : perso, équipe, projet, organisation. Une convention qui se répète
peut être promue au niveau organisation, donc disponible pour tout le monde sans
recréer d'agent. À l'interrogation, les faits sont regroupés par couche et la
provenance est visible. C'est le "par défaut, avec le contexte" rendu traçable.

## Récupération

Recherche hybride sur Postgres : vecteurs (pgvector, cosinus) et plein-texte
(tsvector), fusionnés et dédupliqués. Embeddings 768 dimensions (nomic-embed-text),
avec un repli hash déterministe qui tourne sans réseau. Les faits remplacés sont
filtrés, ce qui prépare la détection de contradictions.

## Routage et orchestration

Le routage vers un agent spécialiste se fait par similarité cosinus sur l'identité de
l'agent, au-dessus d'un seuil. Pas de matching par mots-clés, donc n'importe quel
domaine émergent devient adressable. L'orchestration suit une boucle plan, délégation,
vérification, avec des limites dures : profondeur maximale de délégation, nombre
d'agents maximal, budget de temps. Tout ça pour garder un coût et une latence
prévisibles.

## Modèles et interopérabilité

Le gateway LLM est multi-fournisseur : Ollama local, Claude, un endpoint compatible
OpenAI (Groq), ou un mode heuristique déterministe qui tourne sans aucune clé. Utile
pour une éval reproductible ou un environnement fermé.

L'endpoint MCP compte le plus pour l'interop : un agent externe, un agent Notion ou
un client comme Claude Desktop, peut interroger la mémoire de Weave sans changer
d'outil. Weave se place sous les outils existants plutôt qu'à côté.

## Stack

Rust, architecture hexagonale (ports et adaptateurs). Une seule brique d'infra :
Postgres avec pgvector. Les vecteurs, le plein-texte et le graphe (CTE récursive)
vivent dans la même base. Remplacer une brique plus tard (Qdrant, Kuzu, un bus NATS)
revient à écrire un adaptateur, pas à réécrire le cœur.

## Ce que ce n'est pas encore

- Pas de multi-tenant ni de RBAC. Un seul espace pour l'instant.
- Embeddings en mode hash dans la démo, pas les embeddings sémantiques réels.
- Le vérificateur d'orchestration est heuristique, pas un vrai juge.
- Un seul nœud, pas de mise à l'échelle horizontale.
- Connecteurs : Discord marche, Slack et Notion sont au stade lecture seule ou seed.

## Ce que je cherche à valider

Est-ce que le problème du passage niveau 2 vers niveau 3 est bien posé. Est-ce que
des compétences émergentes et partagées aideraient vraiment une organisation qui fait
déjà tourner des centaines d'agents. Et ce qui casserait en premier à cette échelle.
