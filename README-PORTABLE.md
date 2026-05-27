# PTT Live - Guide de Déploiement Portable

Ce guide explique comment déployer **PTT Live** sur n'importe quelle machine macOS ou Linux, sans configuration manuelle d'IP ou de devices audio.

---

## 🚀 Installation Rapide

### Prérequis

- **macOS** : Homebrew installé ([brew.sh](https://brew.sh))
- **Linux** : Ubuntu 22.04+, Debian 11+, Arch Linux ou Fedora
- **Node.js** : Version 20+ (installé automatiquement si absent)
- **Connexion Internet** : Pour télécharger les dépendances

### Commandes

```bash
# Cloner ou télécharger le projet
cd ptt-live

# Lancer l'installation (détection automatique OS)
./install.sh

# Ou manuellement selon votre système :
./install/macos.sh   # macOS
./install/linux.sh   # Linux
```

### Ce que l'installeur fait automatiquement

✅ Détecte votre système d'exploitation  
✅ Installe Node.js 20+ (si absent)  
✅ Installe LiveKit Server (binaire local)  
✅ Installe les backends audio (sox/PipeWire/JACK)  
✅ Détecte votre IP réseau locale  
✅ Génère les fichiers `.env` avec la bonne configuration  
✅ Installe toutes les dépendances npm  

---

## 🎬 Démarrage

### Méthode 1 : Script unifié (recommandé)

```bash
# Mode développement (serveur + client avec hot-reload)
./start.sh --dev

# Mode production (build client + serveur optimisé)
./start.sh
```

L'IP réseau est **détectée automatiquement** et affichée au démarrage.

### Méthode 2 : Manuel (deux terminaux)

**Terminal 1 : Serveur**
```bash
cd server
npm run dev
```

**Terminal 2 : Client**
```bash
cd client
npm run dev
```

---

## 🌐 Accès depuis d'autres appareils

### Sur le même réseau WiFi

Après le démarrage, notez l'**IP affichée** (exemple : `192.168.1.100`).

#### Depuis un smartphone/tablette

1. **Connectez l'appareil au même WiFi** que le serveur
2. Ouvrez le navigateur
3. Allez sur : `https://IP_SERVEUR:5173` (dev) ou `http://IP_SERVEUR:3000` (prod)
4. **iOS** : Installez la PWA sur l'écran d'accueil pour activer les notifications

#### Depuis un autre ordinateur

Même procédure : `https://IP_SERVEUR:5173`

---

## ⚙️ Configuration Avancée

### Changer l'IP du serveur manuellement

Si l'auto-détection ne fonctionne pas (VPN, Docker, etc.) :

**1. Modifier `server/.env`**

```bash
# Remplacer AUTO par l'IP voulue
LIVEKIT_URL=ws://192.168.1.100:7880
```

**2. Pour le client (accès réseau)**

Modifier `client/.env` :

```bash
# Décommenter et mettre l'IP du serveur
VITE_API_URL=http://192.168.1.100:3000
```

**3. Redémarrer**

```bash
./start.sh --dev
```

### Lister les devices audio disponibles

```bash
# Via API (serveur doit tourner)
curl http://localhost:3000/admin/devices/list

# Retourne JSON :
{
  "inputs": [
    { "id": 0, "name": "Microphone MacBook Pro" },
    { "id": 4, "name": "USB Audio Interface" }
  ],
  "outputs": [...],
  "platform": "darwin"
}
```

Utilisez ensuite l'interface admin (`/admin`) pour sélectionner les devices.

### Changer les ports

**API serveur (port 3000 par défaut)**

Modifier `server/.env` :

```bash
PORT=3001
```

**Client dev (port 5173 par défaut)**

Modifier `client/vite.config.js` :

```javascript
server: {
  port: 5174,
  // ...
}
```

---

## 📦 Mode Production (événement en conditions réelles)

### Build optimisé

```bash
# Build du client statique
cd client
npm run build

# Le dossier dist/ contient le build optimisé
```

### Servir en production

```bash
# Méthode 1 : Script start.sh (recommandé)
./start.sh

# Méthode 2 : npm start direct
cd server
npm start

# Le serveur Express sert automatiquement client/dist/
```

### Reverse proxy Nginx (optionnel)

Pour un domaine personnalisé avec HTTPS :

```nginx
server {
    listen 443 ssl http2;
    server_name ptt.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Client PWA
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket LiveKit
    location /livekit {
        proxy_pass http://localhost:7880;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## 🐛 Dépannage

### Erreur "Port déjà utilisé"

**Port 3000 (API)**
```bash
# Trouver le processus
lsof -i :3000
# Tuer ou changer PORT dans .env
```

**Port 7880 (LiveKit)**
```bash
lsof -i :7880
# Arrêter LiveKit ou changer dans config.yaml
```

### IP détectée incorrecte

**Lister toutes les interfaces réseau :**

```bash
# macOS
ifconfig | grep "inet "

# Linux
ip addr show
```

Puis modifier `server/.env` avec la bonne IP.

### Clients ne peuvent pas se connecter

**1. Vérifier le serveur**
```bash
curl http://IP_SERVEUR:3000/health
```

**2. Vérifier LiveKit**
```bash
curl http://IP_SERVEUR:7880
```

**3. Firewall**

macOS/Linux : autoriser ports 3000, 7880, 7882 (UDP)

```bash
# macOS
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /path/to/node
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblock /path/to/livekit-server

# Linux (ufw)
sudo ufw allow 3000/tcp
sudo ufw allow 7880/tcp
sudo ufw allow 7882/udp
```

### Pas d'audio (macOS)

**Permissions microphone :**

1. **Navigateur** : Autoriser le micro dans les préférences Safari/Chrome
2. **Terminal** : `Réglages Système > Confidentialité > Microphone` → autoriser Terminal

**Carte son externe :**

```bash
# Lister devices
curl http://localhost:3000/admin/devices/list

# Sélectionner via interface admin
open http://localhost:3000/admin
```

### Pas d'audio (Linux)

**Vérifier PipeWire :**

```bash
systemctl --user status pipewire
pw-cli info 0
```

**Démarrer si inactif :**

```bash
systemctl --user start pipewire pipewire-pulse
```

**Lister devices PulseAudio :**

```bash
pactl list short sources  # Inputs
pactl list short sinks    # Outputs
```

---

## 📚 Architecture Portable

### Structure des fichiers de configuration

```
PTT Live/
├── server/
│   ├── .env                 # Généré par install (IP auto)
│   └── config/
│       └── config.yaml      # LIVEKIT_URL = AUTO
├── client/
│   ├── .env                 # Généré par install
│   └── .env.example         # Template
└── install/
    ├── macos.sh             # Détection IP + génération .env
    └── linux.sh             # Idem
```

### Flux de configuration automatique

```
1. install.sh
   └─> Détecte OS (macOS/Linux)
   └─> Lance install/{os}.sh
       └─> Détecte IP réseau (ifconfig/hostname)
       └─> Génère server/.env avec LIVEKIT_URL=AUTO
       └─> Génère client/.env avec IP dans commentaires

2. npm run dev (serveur)
   └─> Lit server/.env
   └─> Si LIVEKIT_URL=AUTO → détecte IP au runtime (index.js:75)
   └─> Lance LiveKit sur 0.0.0.0:7880
   └─> Retourne ws://IP_DETECTÉE:7880 aux clients via /token

3. Client se connecte
   └─> Appelle POST /token avec username + groupId
   └─> Reçoit { token, url: "ws://192.168.x.x:7880" }
   └─> Se connecte automatiquement à la bonne URL
```

**Résultat** : **Zéro configuration manuelle** d'IP pour l'utilisateur final.

---

## 🔒 Sécurité en Production

### Bonnes pratiques

1. **Changer les clés LiveKit** (par défaut : `devkey/secret`)

   Modifier `server/.env` :
   ```bash
   LIVEKIT_API_KEY=$(openssl rand -hex 32)
   LIVEKIT_API_SECRET=$(openssl rand -hex 64)
   ```

2. **Activer HTTPS/WSS** (avec certificats Let's Encrypt ou mkcert)

3. **Firewall strict** : Autoriser seulement les ports nécessaires

4. **Authentification admin** : Ajouter un mot de passe sur `/admin` (Phase 2.3)

5. **VLAN dédié** : Isoler le réseau PTT Live du reste du LAN (événements)

---

## ✨ Fonctionnalités Portables

✅ **Auto-détection IP réseau** (macOS/Linux)  
✅ **Auto-détection devices audio** (API `/admin/devices/list`)  
✅ **Génération .env automatique** lors de l'installation  
✅ **Scripts start.sh multi-OS** (dev/prod)  
✅ **Configuration dynamique Vite** (loadEnv)  
✅ **Support JACK, PipeWire, CoreAudio**  
✅ **PWA installable** (iOS/Android)  

---

## 📖 Documentation Complémentaire

- [README.md](README.md) — Guide utilisateur complet
- [NETWORK_SETUP.md](NETWORK_SETUP.md) — Configuration réseau détaillée
- [CLAUDE.md](CLAUDE.md) — Documentation développement
- [docs/](docs/) — Guides techniques (JACK, Dante, AES67)

---

**Dernière mise à jour** : 2026-05-27  
**Version** : 0.2.0 (Portable)
