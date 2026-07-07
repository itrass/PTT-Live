# 🔐 Configuration SSL 100% Locale - PTT Live

## Problème Résolu

❌ **Avant** : Certificats self-signed bloqués par navigateurs
✅ **Après** : Certificats locaux **automatiquement approuvés**

---

## Solution : mkcert

**mkcert** génère des certificats SSL locaux **de confiance** :
- ✅ Approuvés automatiquement par Chrome/Safari/Edge/Firefox
- ✅ Approuvés par le système (macOS/Linux)
- ✅ Pas besoin de clics "Accepter le risque"
- ✅ 100% local, pas de cloud, pas de domaine

---

## 🚀 Installation Automatique (Recommandée)

### Un seul script fait tout

```bash
# Depuis la racine du projet
./setup-certificates.sh
```

Ce script :
1. ✅ Installe `mkcert` (si pas déjà installé)
2. ✅ Installe la CA locale (Certificate Authority)
3. ✅ Génère certificats pour localhost + IP réseau
4. ✅ Configure automatiquement serveur et client
5. ✅ Crée les `.env` avec chemins certificats

**Temps : ~2 minutes**

---

## 📋 Ce qui est Créé

### Structure

```
PTT Live/
├── certs/                          # Nouveau dossier
│   ├── localhost.pem               # Certificat public
│   └── localhost-key.pem           # Clé privée
│
├── server/.env                     # Mis à jour automatiquement
│   ├── SSL_CERT=/path/to/localhost.pem
│   └── SSL_KEY=/path/to/localhost-key.pem
│
└── client/
    ├── .env                        # Créé automatiquement
    └── vite.config.js              # Mis à jour avec HTTPS
```

### Certificats Générés Pour

- `localhost`
- `127.0.0.1`
- Votre **IP réseau** (ex: `192.168.1.10`)
- `*.local` (wildcard)
- `$(hostname).local`

---

## 🌐 URLs d'Accès

Après installation, accès HTTPS sans warnings :

```
Serveur :  https://192.168.1.10:3000
Client :   https://192.168.1.10:5173

QR Code : généré automatiquement au démarrage
```

---

## 📱 Smartphones (iOS/Android)

### Première Connexion

1. **Scanner le QR Code** affiché au démarrage du serveur
2. Le navigateur ouvre l'URL HTTPS
3. **Accepter le certificat** (une seule fois par appareil)
   - iOS : Cliquer "Continuer" → "Visiter ce site web"
   - Android : Cliquer "Avancé" → "Continuer vers le site"
4. La PWA se charge normalement
5. **Installer sur l'écran d'accueil** (recommandé)

### Pourquoi Accepter Manuellement sur Mobile ?

La CA locale est installée sur l'**ordinateur serveur**, pas sur le smartphone.

**Options** :

**A) Accepter à chaque appareil** (simple, rapide)
- Une seule fois par smartphone
- 2 clics

**B) Installer la CA sur les mobiles** (optionnel, avancé)
- iOS : Réglages → Général → VPN & Gestion → Profils
- Android : Paramètres → Sécurité → Certificats

💡 **Recommandation** : Option A (accepter manuellement), plus simple.

---

## 🛠️ Fonctionnement Technique

### 1. mkcert

```bash
# Installer CA locale (une fois par machine)
mkcert -install

# Générer certificats
mkcert localhost 192.168.1.10 *.local
# → Crée localhost.pem + localhost-key.pem
```

### 2. Serveur Express (HTTPS)

```javascript
// server/index.js
const https = require('https');
const fs = require('fs');

const httpsOptions = {
  key: fs.readFileSync(process.env.SSL_KEY),
  cert: fs.readFileSync(process.env.SSL_CERT)
};

https.createServer(httpsOptions, app).listen(3000);
```

### 3. Vite Dev Server (HTTPS)

```javascript
// client/vite.config.js
export default defineConfig({
  server: {
    https: {
      key: fs.readFileSync('../certs/localhost-key.pem'),
      cert: fs.readFileSync('../certs/localhost.pem')
    }
  }
});
```

---

## 🔧 Installation Manuelle (Si Script Échoue)

### macOS

```bash
# 1. Installer mkcert
brew install mkcert
brew install nss  # Pour Firefox

# 2. Installer CA locale
mkcert -install

# 3. Créer dossier certificats
mkdir certs
cd certs

# 4. Générer certificats (remplacer IP)
mkcert localhost 127.0.0.1 192.168.1.10 *.local

# 5. Renommer
mv localhost+*.pem localhost.pem
mv localhost+*-key.pem localhost-key.pem

# 6. Configurer .env (voir ci-dessous)
```

### Linux

```bash
# 1. Installer dépendances
sudo apt-get install libnss3-tools  # Debian/Ubuntu
# OU
sudo yum install nss-tools          # RedHat/CentOS

# 2. Télécharger mkcert
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64
sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert

# 3-6. Mêmes étapes que macOS
```

### Configuration Manuelle .env

**server/.env** :
```bash
USE_LOCAL_LIVEKIT=true
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
LIVEKIT_URL=AUTO

PORT=3000
ENABLE_HTTPS=true

# Chemins ABSOLUS
SSL_CERT=/Users/vous/PTT Live/certs/localhost.pem
SSL_KEY=/Users/vous/PTT Live/certs/localhost-key.pem

NETWORK_IP=192.168.1.10  # Votre IP
```

**client/.env** :
```bash
VITE_SERVER_URL=https://192.168.1.10:3000
```

---

## ✅ Vérification

### 1. Certificats Créés ?

```bash
ls -lh certs/
# Doit afficher :
# localhost.pem
# localhost-key.pem
```

### 2. CA Installée ?

```bash
mkcert -CAROOT
# Affiche le chemin de la CA (ex: /Users/vous/Library/Application Support/mkcert)
```

### 3. Serveur HTTPS Fonctionne ?

```bash
# Démarrer
./start.sh --dev

# Vérifier
curl -k https://localhost:3000/health
# Doit retourner JSON sans erreur
```

### 4. Client HTTPS Fonctionne ?

Ouvrir dans navigateur :
```
https://localhost:5173
```

✅ **Pas de warning SSL** = succès !

---

## 🐛 Dépannage

### Erreur "Certificats SSL introuvables"

**Symptôme** : Le serveur refuse de démarrer

**Solution** :
```bash
# 1. Vérifier que les certificats existent
ls certs/

# 2. Relancer le script
./setup-certificates.sh

# 3. Vérifier .env
cat server/.env | grep SSL_
```

### Warning SSL sur Smartphone

**Symptôme** : "Votre connexion n'est pas privée"

**Solution** : Normal ! Cliquer "Avancé" → "Continuer"
- Une seule fois par appareil
- La CA locale n'est pas sur le mobile

### Firefox : Certificat Non Approuvé

**Symptôme** : Firefox affiche warning (Chrome OK)

**Solution** :
```bash
# Installer NSS tools
brew install nss          # macOS
sudo apt install libnss3-tools  # Linux

# Réinstaller CA
mkcert -install
```

### Certificat Expiré

**Symptôme** : Après plusieurs mois

**Solution** :
```bash
# Régénérer certificats
cd certs
rm *.pem
mkcert localhost $(ipconfig getifaddr en0) *.local

# Redémarrer serveur
```

---

## 🔄 Renouvellement

Les certificats mkcert sont valides **10 ans** (pas besoin de renouveler).

Pour regénérer (changement d'IP, etc.) :

```bash
./setup-certificates.sh
# Écrase les anciens certificats
```

---

## 🌍 Production (Déploiement Réel)

### Option 1 : mkcert (Réseau Local Privé)

✅ **Si PTT Live reste sur réseau local privé** (WiFi événement)
- Garder mkcert
- Les clients acceptent le certificat une fois
- Pas besoin de domaine/DNS

### Option 2 : Let's Encrypt (Internet Public)

⚠️ **Si PTT Live doit être accessible depuis Internet**
- Nécessite un domaine (ex: `ptt.votredomaine.com`)
- Utiliser Caddy ou Certbot (Let's Encrypt)
- Pas recommandé pour intercom événementiel

**Recommandation** : Rester sur **Option 1** (mkcert + réseau local)

---

## 📚 Ressources

- **mkcert** : https://github.com/FiloSottile/mkcert
- **Vite HTTPS** : https://vitejs.dev/config/server-options.html#server-https
- **Node.js HTTPS** : https://nodejs.org/api/https.html

---

## ✅ Récapitulatif

| Avant | Après |
|-------|-------|
| ❌ Certificats self-signed bloqués | ✅ Certificats approuvés automatiquement |
| ❌ Warnings "Non sécurisé" | ✅ Cadenas vert 🔒 |
| ❌ WebRTC refuse HTTPS invalide | ✅ WebRTC fonctionne |
| ❌ Configuration manuelle complexe | ✅ Script automatique 2 min |
| ❌ Dépendance cloud/domaine | ✅ 100% local |

---

**Solution : `./setup-certificates.sh` → 2 minutes → HTTPS fonctionnel**

🎉 Problème résolu définitivement !
