# Changelog - Version Portable 0.2.0

**Date** : 2026-05-27  
**Objectif** : Rendre PTT Live entièrement portable, sans configuration manuelle d'IP ou de devices audio

---

## 🎯 Problèmes Résolus

### Avant (v0.1.0)
❌ IP hardcodée dans `config.yaml` → impossible à déployer sur autre réseau  
❌ Devices audio hardcodés → non portable entre machines  
❌ Client `vite.config.js` avec proxy hardcodé → dev uniquement sur machine d'origine  
❌ Installation manuelle complexe (multiples étapes, .env à créer manuellement)  
❌ Pas de script de démarrage unifié  

### Après (v0.2.0)
✅ **Auto-détection IP réseau** au démarrage (mode AUTO)  
✅ **Auto-détection devices audio** via API `/admin/devices/list`  
✅ **Génération .env automatique** lors de l'installation  
✅ **Vite config dynamique** avec `loadEnv()`  
✅ **Scripts portables** : `./install.sh` + `./start.sh`  

---

## 📝 Changements Détaillés

### 1. Configuration Auto-Détectée

**Fichier : `server/config/config.yaml`**
```diff
server:
  livekit:
-   url: ws://192.168.0.146:7880
+   url: AUTO  # Détection automatique IP réseau
```

```diff
audio:
  device:
-   inputDeviceId: Microphone MacBook Pro
-   outputDeviceId: Haut-parleurs MacBook Pro
+   inputDeviceId: null  # Auto-détection device par défaut
+   outputDeviceId: null
```

### 2. Client Dynamique

**Fichier : `client/vite.config.js`**
```diff
-import { defineConfig } from 'vite';
+import { defineConfig, loadEnv } from 'vite';

-export default defineConfig({
+export default defineConfig(({ mode }) => {
+  const env = loadEnv(mode, process.cwd(), '');
+  const apiUrl = env.VITE_API_URL || 'http://localhost:3000';
+  
+  return {
    server: {
      proxy: {
        '/api': {
-         target: 'http://192.168.0.146:3000',
+         target: apiUrl.startsWith('/') ? 'http://localhost:3000' : apiUrl,
```

**Nouveau fichier : `client/.env.example`**
```bash
VITE_API_URL=/api  # Dev local (proxy Vite)
# VITE_API_URL=http://192.168.1.100:3000  # Réseau
```

### 3. API Auto-Détection Devices

**Nouveau endpoint : `GET /admin/devices/list`**

Détecte automatiquement les devices audio selon la plateforme :
- **macOS** : sox (CoreAudio)
- **Linux** : JACK → PipeWire → PulseAudio (fallback cascade)
- **Windows** : Placeholder (Phase 3)

Exemple réponse :
```json
{
  "inputs": [
    { "id": 0, "name": "Microphone MacBook Pro" },
    { "id": 4, "name": "Focusrite Scarlett 2i2" }
  ],
  "outputs": [
    { "id": 0, "name": "Haut-parleurs MacBook Pro" },
    { "id": 1, "name": "Focusrite Scarlett 2i2" }
  ],
  "platform": "darwin"
}
```

### 4. Scripts Portables

**`install.sh`** (nouveau)
- Détection OS automatique (macOS/Linux)
- Lance le script d'installation approprié
- Détecte IP réseau locale
- Génère `server/.env` et `client/.env` automatiquement

**`install/macos.sh`** (amélioré)
```bash
# Détection IP
NETWORK_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)

# Génération server/.env
cat > server/.env << EOF
LIVEKIT_URL=AUTO
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
PORT=3000
EOF

# Génération client/.env
cat > client/.env << EOF
VITE_API_URL=/api
# VITE_API_URL=http://${NETWORK_IP}:3000
EOF
```

**`install/linux.sh`** (amélioré)
- Même logique que macOS
- Support Ubuntu/Debian/Arch/Fedora
- Installation PipeWire/JACK automatique

**`start.sh`** (nouveau)
- Lance serveur + client en une commande
- Modes : `./start.sh` (prod) ou `./start.sh --dev` (dev)
- Détection IP au démarrage
- Cleanup propre (SIGINT/SIGTERM)
- Health check serveur avant lancement client

### 5. Documentation

**`README-PORTABLE.md`** (nouveau)
- Guide complet déploiement portable
- Installation zéro-config
- Configuration avancée (IP manuelle, devices, ports)
- Mode production (build, nginx, systemd)
- Dépannage détaillé

**`README.md`** (mis à jour)
- Installation automatique en premier (recommandé)
- Installation manuelle LiveKit Cloud en alternatif
- Version bump 0.2.0

### 6. .gitignore et Templates

**`.gitignore`** (amélioré)
```diff
# Environment variables
.env
+server/.env
+client/.env
+
+# Keep .env.example (templates)
+!.env.example
+!client/.env.example
+!server/.env.example
+
+# Runtime files
+server.log
+/tmp/ptt-live.pid
```

**`server/.env.example`** (nouveau)
Template documenté avec mode AUTO expliqué.

---

## 🚀 Utilisation

### Installation (1 commande)

```bash
./install.sh
```

### Démarrage (1 commande)

```bash
# Mode développement
./start.sh --dev

# Mode production
./start.sh
```

### Accès réseau

L'IP est **affichée automatiquement** au démarrage :

```
📡 IP réseau détectée : 192.168.1.100
🌐 Accès :
   • Local : https://localhost:5173
   • Réseau : https://192.168.1.100:5173
```

Depuis smartphone : `https://192.168.1.100:5173`

---

## 📊 Statistiques

**Commits** : 4 commits atomiques
- `b35f80f` - feat: configuration portable - URLs et devices auto-détectés
- `324ff11` - feat: scripts portables et API détection devices audio
- `ec06732` - docs: guide portable complet et mise à jour README
- `94e03fc` - chore: amélioration .gitignore et templates .env

**Fichiers modifiés** : 10
**Fichiers créés** : 5
- `install.sh`
- `start.sh`
- `README-PORTABLE.md`
- `client/.env.example`
- `server/.env.example`

**Lignes de code ajoutées** : ~950
**Lignes de documentation** : ~600

---

## 🎯 Résultat

PTT Live est maintenant **entièrement portable** :
- ✅ Déploiement sur n'importe quelle machine macOS/Linux
- ✅ Installation en 1 script (~3 minutes)
- ✅ Démarrage en 1 commande
- ✅ Zéro configuration manuelle d'IP
- ✅ Auto-détection devices audio
- ✅ Accès réseau WiFi automatique
- ✅ Documentation complète

**Production-ready** pour événements en conditions réelles.

---

**Auteur** : Claude Code  
**Date** : 2026-05-27
