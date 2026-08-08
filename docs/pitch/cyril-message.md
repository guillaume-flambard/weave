# Message de prise de contact — Cyril Allard

Rédigé au humanizer : pas d'em-dash, pas d'emoji, ton ingénieur, aucune poussée
commerciale. Objectif du premier contact : lui donner une vue d'ensemble, être
transparent sur l'état prototype, et récupérer son avis.

Cyril est joignable sur LinkedIn (intervenant du webinar Notion x Pennylane).
Choisir : soit une note de connexion courte, soit un message/email une fois connecté.

---

## Version longue (message une fois connecté, ou email)

> Bonjour Cyril,
>
> J'ai regardé votre webinar avec Notion sur les agents personnalisés chez Pennylane.
> Le passage sur le mur entre le niveau 2 et le niveau 3 m'a parlé, surtout quand vous
> décrivez ce que serait l'idéal : des compétences disponibles par défaut, avec le
> contexte, sans que chacun doive recréer son propre agent. Et vous ajoutez que ce
> n'est possible nulle part aujourd'hui.
>
> Ça m'a donné envie de coder un prototype pour voir si c'était faisable. C'est parti
> de votre intervention. L'idée : une couche de mémoire d'équipe qui lit l'activité et
> fait émerger des compétences réutilisables à partir des questions qui reviennent.
> Quand on interroge cette mémoire, la réponse arrive avec sa provenance, rangée par
> couche : perso, équipe, projet, organisation. C'est le "par défaut" dont vous parliez.
>
> Je l'ai branché sur Discord pour commencer, parce que c'est ce qu'on utilise au
> quotidien avec mes collègues en ce moment, plus que Slack. Côté technique c'est sobre :
> Rust, une seule base (Postgres), et un endpoint MCP pour qu'un agent externe, un agent
> Notion par exemple, puisse interroger cette mémoire sans quitter son outil. L'idée
> n'est pas d'ajouter un outil de plus mais de poser une couche en dessous de ceux que
> vous avez déjà.
>
> Je précise : c'est un prototype, et mon but ici n'est pas de vous pitcher un produit.
> D'abord, ça m'intéresse d'avoir votre regard, parce que vous faites tourner 400 agents
> et que vous voyez des choses que je ne vois pas : est-ce que je vise le bon problème,
> est-ce que l'approche tient à votre échelle.
>
> Ensuite, si le sujet vous parle, ce qui me plairait vraiment ce serait d'avancer
> dessus ensemble de temps en temps. Rien de lourd. Je mène un autre projet en parallèle,
> donc je vois plutôt ça comme une collaboration légère, à notre rythme, chacun gardant
> sa liberté, pour voir où ça mène.
>
> Je peux vous envoyer une page qui décrit le fonctionnement, et le lien du repo si vous
> voulez regarder le code. J'y joins aussi une courte vidéo. Elle est générée par IA,
> faite vite, rien de calibré ni de définitif : je la mets surtout pour montrer que je
> prends l'exemple de Pennylane au sérieux, pas pour le rendu. Et si vous avez quinze
> minutes un de ces jours, je prends volontiers.
>
> Guillaume

## Version courte (note de connexion LinkedIn, < 300 caractères)

> Bonjour Cyril, votre webinar Notion x Pennylane m'a donné envie de coder un prototype
> autour des compétences partagées "par défaut, avec contexte" que vous disiez possibles
> nulle part. J'aimerais votre regard dessus, et voir si ça vaut le coup d'avancer
> ensemble à l'occasion. Guillaume

---

## Notes d'envoi

- Adapter la phrase du repo selon ta décision GitHub (voir `brief-guillaume.md`,
  section GitHub). Si tu passes le repo en public : "le lien du repo, il est en accès
  libre". Si tu préfères le garder privé : "je te donne un accès en lecture sur le repo
  si tu veux voir le code".
- Pièce jointe / lien à joindre : `weave-apercu.md` (aperçu technique, non commercial).
- Joindre la vidéo `tools/video/out/weave-explainer.mp4`, présentée comme générée par
  IA et non définitive (déjà dit dans le message). Assumée imparfaite : on est au stade
  MVP, rien à vendre, donc pas besoin d'un rendu impeccable.
