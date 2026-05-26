# Audit PTT Live — 2026-05-26

## Structure & Documentation

La structure réelle **diverge de CLAUDE.md** — l'implémentation a avancé au-delà du plan initial sans mise à jour de la doc.

Fichiers documentés mais absents : `server/api/routes.js`, `client/src/utils/audio.js`
Fichiers présents mais non documentés : `AudioBridgeManager.js`, `LiveKitServerBridge.js`, `AudioLevelsServer.js`, + plusieurs composants React.

---

## Problèmes critiques

**1. Chaîne audio serveur incomplète**
Le bridge audio ne transmet pas l'audio capturé vers LiveKit. Les TODOs sont explicites :
- `server/bridge/AudioBridge.js:368` : `// TODO: Envoyer opusData à LiveKit pour ce groupe spécifique`
- `server/bridge/AudioBridge.js:439` : `// TODO: Implémenter réception bas niveau Opus depuis LiveKit`

Le flux `carte son → LiveKit → clients` n'est pas fonctionnel côté serveur.

**2. `LiveKitServerBridge.js` jamais utilisé**
Fichier créé, jamais importé ni appelé. Contient lui-même un `// TODO: Implémenter l'envoi réel vers LiveKit`. Code mort qui confond les responsabilités avec `LiveKitClient.js`.

**3. Pas d'authentification sur `/admin`**
N'importe qui sur le réseau peut modifier la configuration (groupes, routing, devices). Critique en production.
Note du dev : c'est normal et non critique pour le moment. 

---

## Problèmes de sécurité

| Sévérité | Problème |
|----------|----------|
| Haute | CORS `*` dans `server/index.js` — accès depuis n'importe quel domaine |
| Haute | API `/admin` sans authentification |
| Moyenne | Clés LiveKit hardcodées en fallback `'devkey'/'secret'` |

Note du dev : l'app a pour vocation à être utilisée sur un réseau local.
---

## Qualité du code

**Points positifs**
- Architecture modulaire solide
- EventEmitter bien utilisé pour la réactivité et le hot-reload
- Gestion d'erreurs gracieuse (fallback sans crash si pas de carte son)
- OpusCodec robuste avec presets configurables
- JitterBuffer avec stats adaptatives

**Points faibles**
- Logging DEBUG non retiré dans `server/bridge/LiveKitClient.js:93`
- Device IDs hardcodés dans `config.yaml` (`inputDeviceId: 4`, `outputDeviceId: 0`) — non portable
- Création de `Float32Array` à chaque frame audio → pression GC potentielle à 30+ clients

---

## État des phases

| Phase | Avancement | Bloquant |
|-------|-----------|---------|
| Phase 1 MVP | ~80% | Bridge audio serveur incomplet |
| Phase 2 Fonctionnalités | ~95% | Authentification manquante |
| Phase 3 Intégrations | ~85% | Tests réels manquants |

---

## Recommandations par priorité

### Priorité 1 — Bloquant
1. Implémenter la connexion `AudioBridge → LiveKitClient` (TODOs lignes 368/439)
2. Ajouter authentification sur `/admin` (token Bearer ou session)
3. Supprimer ou intégrer `LiveKitServerBridge.js`

### Priorité 2 — Important
4. CORS : remplacer `*` par origin explicite du client
5. Retirer les `console.log` DEBUG de `LiveKitClient.js`
6. Device IDs : auto-détection plutôt que valeurs hardcodées

### Priorité 3 — Amélioration
7. Pool de buffers audio pré-alloués pour tenir 30+ clients
8. Mettre à jour `CLAUDE.md` avec la structure réelle du code
9. Tests d'intégration E2E (latence mesurée, scénario multi-clients)
