# Brief perso — préparer l'échange avec Cyril

À lire avant l'appel. Le but : que tu sois à l'aise, que tu saches quoi dire, quoi ne
pas surpromettre, et quoi lui demander. Écrit pour toi, pas pour lui.

## En une phrase

Weave est un prototype de couche mémoire qui fait émerger des compétences partagées à
partir de l'activité d'une équipe, avec provenance par couche (perso, équipe, projet,
org), interrogeable en MCP depuis les outils existants.

## Le cadrage (à tenir)

- C'est un prototype, codé après son webinar. Tu le dis d'entrée. Ça te protège et ça
  rend le "je veux ton avis" crédible.
- Tu ne vends rien. Tu veux son regard de gars qui fait tourner 400 agents.
- Tu es branché sur Discord parce que c'est ton quotidien en ce moment, pas Slack. Le
  pipeline est le même pour les autres sources.
- Si tu ne sais pas répondre à une question, dis "pas encore fait, c'est un proto". Ne
  brode pas. Il vient de l'X, il repère l'esbroufe tout de suite.

## Ce qu'il a dit au webinar (ton point d'accroche)

1. Le mur niveau 2 vers niveau 3 : les compétences restent "single-player", dures à
   généraliser à une équipe.
2. Son idéal : des agents disponibles par défaut, pour tout le monde, avec tout le
   contexte, sans que chacun recrée le sien. Il dit que c'est possible nulle part.
3. Deux tiers de ses agents servent juste à garder la donnée propre (garbage in,
   garbage out).
4. Gouvernance : l'IT valide le cadre, pas chaque agent.
5. Coûts : coût max par agent et par employé, rien de plus compliqué.

## Comment Weave répond, point par point

1. Émergence puis promotion au niveau org. Le niveau 3 devient un effet du travail de
   l'équipe, pas un chantier par personne.
2. Provenance par couche mémoire à l'interrogation. C'est exactement son "par défaut,
   avec le contexte", et c'est visible à l'écran.
3. La couche mémoire structure la donnée en continu (faits, entités, dédup,
   canonicalisation). Le nettoyage devient un pipeline, pas 400 agents à la main.
4. Un agent émergent naît en statut "en attente" et ne peut rien faire avant validation
   humaine. C'est son modèle : le cadre est humain, la proposition est machine.
5. Postgres seul, limites dures sur l'orchestration (profondeur, nombre d'agents, temps),
   repli sans clé. Coût et latence prévisibles.

## La technique, en mots que tu peux dire

- Émergence : on compte les occurrences d'un sujet ; au bout de N fois (3 en démo),
  une compétence se matérialise. Sujet canonicalisé, donc les reformulations comptent
  ensemble. Déterministe, pas de boîte noire.
- Agents : quand un domaine cumule assez de compétences, un agent spécialiste est
  proposé, en attente de validation.
- Mémoire : 4 couches perso, équipe, projet, org. Promotion possible au niveau org.
- Récupération : hybride, vecteurs pgvector plus plein-texte tsvector, fusionnés.
- Routage : similarité cosinus sur l'identité de l'agent, seuil 0,35. Pas de mots-clés.
- Orchestration : plan, délégation, vérification. Limites dures profondeur 2, 8 agents,
  180 secondes.
- Modèles : multi-fournisseur (Ollama, Claude, Groq, heuristique sans clé).
- Interop : endpoint MCP, un agent Notion peut interroger la mémoire sans quitter Notion.
- Stack : Rust, hexagonal, une seule base Postgres avec pgvector.

## Les limites (assume-les, ne les cache pas)

- Pas de multi-tenant ni RBAC.
- Embeddings en hash dans la démo, pas les sémantiques réels.
- Vérificateur heuristique, pas un vrai juge.
- Un seul nœud.
- Slack et Notion en lecture seule ou seed ; Discord est ce qui tourne vraiment.

## Questions qu'il posera, et ta réponse courte

- "Comment tu évites que la mauvaise info devienne une compétence ?" Le seuil de
  récurrence plus la dédup ; et il y a un champ superseded pour remplacer un fait, base
  de la détection de contradictions. Encore basique.
- "Ça scale à des milliers d'agents ?" Pas testé à cette échelle, c'est une des choses
  sur lesquelles je veux ton avis. Aujourd'hui limites dures et un seul nœud.
- "Pourquoi pas juste rester sur Notion ?" Weave ne remplace pas Notion, il se branche
  dessous en MCP. Notion reste l'interface.
- "Embeddings hash, sérieusement ?" C'est le repli offline pour une démo reproductible.
  En vrai on passe sur nomic-embed-text 768 dim, l'interface est la même.
- "Sécurité, gouvernance ?" Agents en attente de validation, scoping par couche. Le
  multi-tenant et le RBAC ne sont pas là, c'est un proto.

## Ce que tu lui demandes (le vrai but)

- Est-ce que le cadrage niveau 2 vers niveau 3 colle à sa réalité chez Pennylane ?
- Est-ce que des compétences émergentes et partagées régleraient un vrai point de
  douleur, ou est-ce qu'il gère déjà ça autrement ?
- Qu'est-ce qui casserait en premier à 400 agents et plus ?
- Sur la gouvernance, est-ce que le modèle "émergent puis validé" est le bon ?

## GitHub : mon avis

Oui, partage le repo. Pour quelqu'un de technique qui vient de l'X, voir le vrai code
(Rust, une seule base, hexagonal) vaut mille slides et colle à ton "donne-moi ton avis
honnête". Le repo est propre : `.env` ignoré, aucun secret committé, `.env.example` en
placeholders.

Deux façons de faire :
- Le passer en public. Sans risque de fuite ici. Avant : ajoute une description au repo
  et une ligne en haut du README qui dit que c'est un prototype issu du webinar.
- Ou le garder privé et donner à Cyril un accès en lecture (il te faut son handle
  GitHub). Plus contrôlé, mais tu ajoutes une friction pour lui.

Reco : public, après la petite passe README. C'est le plus fluide pour lui et le plus
cohérent avec la démarche.
