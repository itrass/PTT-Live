# Configuration Réseau - Connexion Multi-Appareils

## Problème résolu

Le serveur retournait précédemment `ws://localhost:7880` aux clients, ce qui empêchait les connexions depuis d'autres appareils sur le réseau.

## Solution

Le serveur détecte maintenant automatiquement l'IP réseau locale et retourne l'URL LiveKit correcte aux clients.

## Configuration

### Fichier `.env`

```bash
# AUTO = détection automatique de l'IP réseau
LIVEKIT_URL=AUTO

# OU spécifier manuellement l'IP du serveur
# LIVEKIT_URL=ws://192.168.1.100:7880
```

### Mode AUTO (recommandé)

Le mode `AUTO` détecte automatiquement l'IP réseau :
- **macOS** : WiFi (en0) ou Ethernet (en1)
- **Linux** : eth0, wlan0, ou première interface réseau

L'IP détectée est affichée au démarrage :
```
📡 IP réseau détectée : 10.1.1.111
🔗 URL LiveKit clients : ws://10.1.1.111:7880
```

### Mode manuel

Si la détection automatique ne fonctionne pas, spécifiez l'IP manuellement :

1. Trouvez l'IP du serveur :
   ```bash
   # macOS
   ifconfig | grep "inet " | grep -v 127.0.0.1

   # Linux
   ip addr show | grep "inet " | grep -v 127.0.0.1
   ```

2. Modifiez `.env` :
   ```bash
   LIVEKIT_URL=ws://VOTRE_IP:7880
   ```

## Test connexion multi-appareils

### 1. Démarrer le serveur

```bash
cd server
npm run dev
```

Notez l'IP affichée (ex: `10.1.1.111`)

### 2. Accéder depuis un autre appareil

#### Sur smartphone (même WiFi)

1. Ouvrir navigateur
2. Aller sur : `http://10.1.1.111:3000` (remplacer par l'IP serveur)
3. Le client PWA va automatiquement recevoir l'URL LiveKit correcte

#### Depuis un autre ordinateur

Même procédure : `http://IP_SERVEUR:3000`

## Ports utilisés

- **3000** : API REST (serveur Express)
- **7880** : LiveKit WebSocket (connexions WebRTC)
- **7882** : LiveKit UDP (trafic RTP audio/vidéo)

## Firewall et réseau

### macOS

Autorisez Node.js et LiveKit dans les préférences réseau si demandé.

### Configuration WiFi recommandée

- **QoS activée** : Priorisation trafic audio/vidéo
- **Isolation client désactivée** : Permet communication entre appareils
- **Band 5GHz** : Meilleure latence que 2.4GHz

## Dépannage

### Erreur "bind: address already in use"

Un autre processus utilise le port 7880 ou 7882 :

```bash
# Trouver le processus
lsof -i :7880
lsof -i :7882

# Tuer le processus si nécessaire
kill -9 PID
```

### Client ne peut pas se connecter

1. Vérifiez que le serveur tourne :
   ```bash
   curl http://IP_SERVEUR:3000/health
   ```

2. Vérifiez l'URL LiveKit retournée :
   ```bash
   curl http://IP_SERVEUR:3000/config
   ```

3. Testez la connexion LiveKit :
   ```bash
   # Depuis un navigateur sur le client
   # Console DevTools :
   const ws = new WebSocket('ws://IP_SERVEUR:7880');
   ws.onopen = () => console.log('LiveKit accessible !');
   ws.onerror = (e) => console.error('Erreur:', e);
   ```

### IP détectée incorrecte

Si le serveur détecte la mauvaise IP (ex: VPN, Docker, etc.) :

1. Utilisez le mode manuel dans `.env`
2. Ou modifiez la priorité des interfaces dans `server/index.js` (ligne 28)

## Sécurité

⚠️ **En production**, utilisez HTTPS/WSS :

```bash
# .env
LIVEKIT_URL=wss://votre-domaine.com:7880
```

Et configurez des certificats SSL pour LiveKit et Express.

---

**Dernière mise à jour** : 2026-05-22
