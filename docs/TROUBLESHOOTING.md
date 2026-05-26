# Guide de Troubleshooting - PTT Live

Guide de diagnostic et résolution des problèmes courants.

---

## Table des matières

1. [Problèmes Audio](#problèmes-audio)
2. [Problèmes Réseau](#problèmes-réseau)
3. [Problèmes Client (PWA)](#problèmes-client-pwa)
4. [Problèmes Serveur](#problèmes-serveur)
5. [Problèmes JACK/Audio Backend](#problèmes-jackaudio-backend)
6. [Problèmes Dante/AES67](#problèmes-danteaes67)
7. [Outils de Diagnostic](#outils-de-diagnostic)

---

## Problèmes Audio

### Pas de son (aucun audio)

#### Symptômes
- Client parle (bouton PTT activé) mais personne n'entend
- Pas d'indicateur audio visuel

#### Diagnostic

```bash
# 1. Vérifier backend audio actif
sudo journalctl -u pttlive-server | grep "Backend audio"
# Devrait afficher : "✓ Backend audio : CoreAudio/JACK/PipeWire"

# 2. Vérifier capture audio fonctionne
# macOS
system_profiler SPAudioDataType | grep "Default Input"

# Linux avec JACK
jack_lsp | grep capture

# 3. Vérifier LiveKit connecté
sudo journalctl -u pttlive-server | grep LiveKit
# Devrait afficher : "✓ LiveKit connecté"
```

#### Solutions

**Cause : Microphone non autorisé (navigateur)**

```
1. Ouvrir les paramètres du navigateur
2. Site Settings → pttlive.local → Permissions
3. Microphone : Allow
4. Rafraîchir la page
```

**Cause : Backend audio non démarré**

```bash
# JACK (Linux)
jackd -d alsa -r 48000 -p 256

# PipeWire (Linux)
systemctl --user start pipewire pipewire-pulse

# CoreAudio (macOS) : déjà natif, vérifier carte son branchée
```

**Cause : Routing JACK manquant**

```bash
# Vérifier connexions
jack_lsp -c

# Reconnecter manuellement
jack_connect "system:capture_1" "PTTLive:input_1"
jack_connect "PTTLive:output_1" "system:playback_1"
```

---

### Latence élevée (> 200ms)

#### Symptômes
- Délai perceptible entre parole et réception
- Conversations difficiles (effet "satellite")

#### Diagnostic

```bash
# 1. Mesurer latence réseau (ping)
ping -i 0.2 serveur_ip
# Devrait être < 10ms en LAN

# 2. Vérifier jitter
iperf3 -c serveur_ip -u -b 1M
# Jitter devrait être < 5ms

# 3. Vérifier buffer JACK
jack_bufsize
# Typique : 256 samples = 5.3ms @ 48kHz

# 4. Logs PTT Live
sudo journalctl -u pttlive-server | grep latency
```

#### Solutions

**Réduire buffer JACK** :

```bash
# Arrêter JACK
killall jackd

# Redémarrer avec buffer plus petit
jackd -d alsa -r 48000 -p 128  # 128 au lieu de 256

# ⚠️ Risque de xruns si CPU faible
```

**Optimiser jitter buffer PTT Live** :

Éditer `server/config/config.yaml` :

```yaml
audio:
  jitterBufferPreset: ULTRA_LOW  # Au lieu de LOW_LATENCY
```

**Optimiser WiFi** :
- Forcer 5GHz (pas de 2.4GHz)
- Réduire nombre de clients par AP (< 15)
- Vérifier channel WiFi pas surchargé (scanner WiFi)

**Budget latence typique** :

| Composant | Latence |
|-----------|---------|
| WiFi | 5-20 ms |
| WebRTC encode/decode | 20-60 ms |
| Jitter buffer | 20-40 ms |
| JACK/backend | 5-10 ms |
| **Total** | 50-130 ms ✅ |

Si > 200ms, problème réseau probable (WiFi congestionné ou mauvaise couverture).

---

### Coupures audio (audio haché)

#### Symptômes
- Son qui coupe régulièrement
- Craquements/pops
- Audio en "robot"

#### Diagnostic

```bash
# 1. JACK xruns
jack_evmon
# Appuyer Ctrl+C après 30s et noter le nombre de xruns
# 0 xrun = OK
# > 5 xruns/min = problème CPU ou buffer trop petit

# 2. CPU usage
htop
# CPU > 90% = surchargé

# 3. Packet loss WebRTC
# Ouvrir navigateur client : chrome://webrtc-internals
# Chercher "packetsLost" : devrait être < 1%

# 4. Logs backend
sudo journalctl -u pttlive-server | grep -i "underrun\|overrun"
```

#### Solutions

**Xruns JACK (CPU overload)** :

```bash
# Augmenter buffer size
jackd -d alsa -r 48000 -p 512  # 512 au lieu de 256

# Priorité real-time JACK
sudo jackd -R -P 70 -d alsa -r 48000 -p 256

# Isoler CPU cores
# Éditer /etc/default/grub :
GRUB_CMDLINE_LINUX="isolcpus=2,3"
# Puis : sudo update-grub && sudo reboot
```

**Packet loss réseau** :

```bash
# Vérifier trafic réseau
iftop -i eth0

# Tester bande passante
iperf3 -c serveur_ip
# Devrait être > 100 Mbps en Gigabit

# Vérifier switch (pas de collisions)
ethtool eth0 | grep -i error
```

**Codec Opus agressif** :

Réduire le bitrate Opus :

```yaml
# server/config/config.yaml
groups:
  - id: regie
    opusBitrate: 64000  # 64kbps au lieu de 96kbps
```

---

### Audio en mono alors que stéréo attendu

#### Cause

Configuration channels à 1 au lieu de 2.

#### Solution

```yaml
# server/config/config.yaml
audio:
  channels: 2  # Stéréo
```

Redémarrer serveur :

```bash
sudo systemctl restart pttlive-server
```

---

## Problèmes Réseau

### Clients ne peuvent pas se connecter

#### Symptômes
- Erreur "Connection failed" dans le client
- Timeout lors de la connexion LiveKit

#### Diagnostic

```bash
# 1. Serveur écoute sur le bon port ?
sudo netstat -tulpn | grep 7880
# Devrait afficher : tcp 0.0.0.0:7880 LISTEN

# 2. Firewall bloque ?
sudo ufw status
# Ports requis : 7880, 7881, 50000-60000

# 3. Client peut ping serveur ?
# Sur smartphone/laptop client :
ping serveur_ip

# 4. Test WebSocket
# Sur client, ouvrir console navigateur :
new WebSocket('ws://serveur_ip:7880')
# Si erreur 404 ou timeout = problème réseau/firewall
```

#### Solutions

**Ouvrir ports firewall** :

```bash
sudo ufw allow 7880/tcp
sudo ufw allow 7881/tcp
sudo ufw allow 50000:60000/udp
sudo ufw reload
```

**Vérifier LiveKit démarre** :

```bash
sudo journalctl -u pttlive-server | grep -i livekit
# Chercher "LiveKit server started"
```

**Tester en local** :

```bash
# Sur le serveur lui-même
curl http://localhost:3000/api/health
# Devrait répondre : {"status":"ok"}
```

---

### Perte de connexion WiFi fréquente

#### Symptômes
- Clients se déconnectent toutes les 1-5 minutes
- Reconnexion automatique ou manuelle requise

#### Diagnostic

```bash
# Sur l'Access Point (exemple UniFi)
# SSH vers AP
ssh ubnt@ap_ip

# Vérifier logs
tail -f /var/log/messages | grep -i disassoc

# Statistiques WiFi
iwconfig wlan0
# Chercher "Signal level" : devrait être > -70 dBm
```

#### Solutions

**Roaming WiFi agressif** :

Activer Fast Roaming (802.11r/k/v) sur les Access Points.

**Channel congestionné** :

```bash
# Scanner WiFi
sudo iwlist wlan0 scan | grep -E "Channel|ESSID|Quality"

# Choisir un channel libre (5GHz : 36, 40, 44, 48, 149, 153, etc.)
```

**Signal faible** :

- Ajouter un Access Point (couverture)
- Repositionner AP existant (hauteur, line-of-sight)
- Vérifier puissance TX AP (pas trop faible)

---

## Problèmes Client (PWA)

### Bouton PTT ne fonctionne pas (mobile)

#### Symptômes
- Appui sur bouton PTT ne fait rien
- Pas de vibration/feedback

#### Diagnostic

```javascript
// Console navigateur mobile (via Remote Debug)
// Chrome Android : chrome://inspect
// Safari iOS : Safari Desktop > Develop > iPhone

// Tester événement touch
document.getElementById('ptt-button').addEventListener('touchstart', (e) => {
  console.log('Touch start:', e);
});
```

#### Solutions

**HTTPS requis** :

Les APIs Web modernes (microphone, vibration) nécessitent HTTPS.

```bash
# Générer certificat auto-signé
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes

# Configurer serveur HTTPS (voir DEPLOYMENT.md)
```

Accéder via `https://serveur_ip` (accepter certificat dans navigateur).

**Microphone non débloqué (iOS)** :

Sur iOS, l'audio nécessite une interaction utilisateur.

```javascript
// Ajouter un bouton "Unlock Audio" au premier lancement
async function unlockAudio() {
  const audio = new Audio();
  await audio.play();
  audio.pause();
  console.log('Audio unlocked');
}
```

---

### PWA ne s'installe pas (iOS)

#### Symptômes
- Bouton "Add to Home Screen" absent
- Pas de popup d'installation

#### Cause

Sur iOS, l'installation PWA est **manuelle** (pas de prompt automatique).

#### Solution

Afficher un message d'aide :

```javascript
// Détecter iOS
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

if (isIOS) {
  // Afficher instructions
  alert(`Pour installer PTT Live :
1. Appuyez sur le bouton Partage (⬆️)
2. Sélectionnez "Sur l'écran d'accueil"
3. Appuyez sur "Ajouter"`);
}
```

---

### Notifications Web Push ne fonctionnent pas

#### Diagnostic

```javascript
// Console navigateur
if ('Notification' in window) {
  console.log('Notification permission:', Notification.permission);
  // granted = OK
  // denied = utilisateur a refusé
  // default = pas encore demandé
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(reg => {
    console.log('Service Worker:', reg);
  });
}
```

#### Solutions

**Permissions non accordées** :

```javascript
async function requestNotificationPermission() {
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    console.log('Notifications autorisées');
  } else {
    alert('Veuillez autoriser les notifications dans les paramètres du navigateur');
  }
}
```

**Service Worker non enregistré** :

```bash
# Vérifier fichier sw.js existe
ls client/public/sw.js

# Vérifier enregistrement dans main.js
grep -r "serviceWorker.register" client/src/
```

---

## Problèmes Serveur

### Serveur ne démarre pas

#### Diagnostic

```bash
# Logs détaillés
sudo journalctl -u pttlive-server -n 100 --no-pager

# Vérifier port 3000 pas déjà utilisé
sudo lsof -i :3000
# Si occupé, tuer le processus ou changer le port

# Vérifier Node.js version
node --version  # Devrait être >= 18
```

#### Solutions

**Port déjà utilisé** :

```bash
# Tuer processus existant
sudo kill $(sudo lsof -t -i:3000)

# Ou changer port dans .env
echo "PORT=3001" >> server/.env
```

**Dépendances manquantes** :

```bash
cd server
npm install
```

**Permissions audio (Linux)** :

```bash
# Ajouter utilisateur au groupe audio
sudo usermod -a -G audio $USER

# Reboot requis
sudo reboot
```

---

### Crash serveur après quelques heures (memory leak)

#### Diagnostic

```bash
# Surveiller RAM
watch -n 1 free -h

# Logs avant crash
sudo journalctl -u pttlive-server --since "1 hour ago" | grep -i error
```

#### Solutions

**Limiter RAM dans systemd** :

Éditer `/etc/systemd/system/pttlive-server.service` :

```ini
[Service]
MemoryLimit=4G
MemoryMax=4G
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart pttlive-server
```

**Garbage collection Node.js** :

```bash
# Lancer Node avec options GC
node --max-old-space-size=2048 --expose-gc index.js
```

---

## Problèmes JACK/Audio Backend

### JACK ne démarre pas

#### Symptômes

```bash
jackd -d alsa -r 48000
# Erreur : "Cannot lock down memory area (Cannot allocate memory)"
```

#### Diagnostic

```bash
# Vérifier limites memlock
ulimit -l
# Devrait être "unlimited"

# Vérifier utilisateur dans groupe audio
groups $USER
# Devrait contenir "audio"
```

#### Solutions

**Configurer memlock** :

Éditer `/etc/security/limits.conf` :

```
@audio   -  memlock    unlimited
@audio   -  rtprio     95
```

Reboot requis :

```bash
sudo reboot
```

---

### JACK démarre mais pas de son

#### Diagnostic

```bash
# Ports JACK disponibles ?
jack_lsp

# Devrait afficher :
# system:capture_1
# system:playback_1
# PTTLive:input_1
# PTTLive:output_1

# Connexions actives ?
jack_lsp -c

# Devrait afficher des connexions
```

#### Solution

```bash
# Connecter manuellement
jack_connect "system:capture_1" "PTTLive:input_1"
jack_connect "PTTLive:output_1" "system:playback_1"

# Ou utiliser QjackCtl (GUI)
qjackctl
# Cliquer "Graph" et faire les connexions visuellement
```

---

## Problèmes Dante/AES67

### Dante Virtual Soundcard ne s'affiche pas dans Dante Controller

#### Diagnostic

```bash
# macOS : DVS est-il démarré ?
ps aux | grep "Dante Virtual Soundcard"

# Firewall bloque Dante ?
# Dante utilise :
# - UDP 319, 320 (PTP)
# - UDP 4440, 4444, 4455 (Dante Discovery)
# - UDP 14336-14591 (Audio flows)
```

#### Solutions

**Désactiver firewall temporairement** :

```bash
# macOS
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off

# Linux
sudo ufw disable
```

Si ça fonctionne, ajouter des règles firewall spécifiques :

```bash
# Linux
sudo ufw allow 319:320/udp
sudo ufw allow 4440:4455/udp
sudo ufw allow 14336:14591/udp
```

**Vérifier réseau** :

- Même subnet que les équipements Dante (ex: 192.168.1.x/24)
- Branché sur le même switch
- IGMP snooping activé sur le switch

---

### Latence Dante trop élevée (> 50ms)

#### Diagnostic

Ouvrir **Dante Controller** :

1. Device View → Sélectionner DVS
2. Device Config → Dante tab
3. Vérifier "Latency" : 5ms ou 10ms recommandé

#### Solution

Réduire latency dans DVS :

1. Ouvrir **Dante Virtual Soundcard**
2. Settings → Latency : 2ms ou 5ms (au lieu de 10ms)
3. Restart

**Attention** : Latence < 5ms risque de coupures si réseau chargé.

---

### PTP non synchronisé (AES67)

#### Symptômes

```bash
sudo ptp4l -i eth0 -f /etc/ptp4l.conf -m
# Offset > 1000 ns (> 1µs)
```

#### Diagnostic

```bash
# Switch supporte PTP ?
# Vérifier config switch (PTP activé)

# PTP master présent sur le réseau ?
sudo tcpdump -i eth0 -n 'port 319 or port 320'
# Devrait afficher des paquets PTP Sync/Follow_Up
```

#### Solutions

**Aucun PTP master** :

Configurer un équipement comme grandmaster (ex: console AES67).

Ou lancer un PTP master software (déconseillé en production) :

```bash
# Mode master (remplacer slaveOnly par masterOnly dans config)
sudo ptp4l -i eth0 --masterOnly -m
```

**Switch ne route pas PTP** :

Vérifier config switch :
- PTP enabled sur tous les ports
- Transparent Clock ou Boundary Clock

---

## Outils de Diagnostic

### Logs Serveur

```bash
# Temps réel
sudo journalctl -u pttlive-server -f

# Depuis le démarrage
sudo journalctl -u pttlive-server --since today

# Filtrer erreurs uniquement
sudo journalctl -u pttlive-server -p err
```

### Monitoring Réseau

```bash
# Trafic réseau temps réel
iftop -i eth0

# Statistiques interface
ip -s link show eth0

# Connexions actives
ss -tunap | grep -E '7880|50000'
```

### Monitoring Audio

```bash
# JACK
jack_evmon       # Surveille xruns
jack_bufsize     # Taille buffer
jack_samplerate  # Sample rate

# PipeWire
pw-top           # CPU usage par client
pw-cli dump      # État complet
```

### Client (Navigateur)

**Chrome DevTools** :

1. F12 → Console : erreurs JavaScript
2. Network : vérifier requêtes API (200 OK attendu)
3. Application → Service Workers : vérifier enregistré
4. `chrome://webrtc-internals` : stats WebRTC détaillées

**Firefox DevTools** :

1. F12 → Console
2. `about:webrtc` : stats WebRTC

---

## Checklist Rapide

### Problème : Pas de son

- [ ] Microphone autorisé navigateur ?
- [ ] Backend audio démarré (JACK/PipeWire) ?
- [ ] Ports JACK connectés ?
- [ ] LiveKit connecté (logs serveur) ?

### Problème : Latence élevée

- [ ] Ping < 10ms ?
- [ ] Buffer JACK = 256 samples ?
- [ ] WiFi 5GHz ?
- [ ] Jitter buffer = LOW_LATENCY ?

### Problème : Coupures audio

- [ ] JACK xruns = 0 ?
- [ ] CPU < 70% ?
- [ ] Packet loss < 1% ?
- [ ] Buffer JACK >= 256 ?

### Problème : Connexion impossible

- [ ] Firewall ports ouverts (7880, 50000-60000) ?
- [ ] LiveKit démarre (journalctl) ?
- [ ] Client peut ping serveur ?
- [ ] HTTPS si PWA ?

---

## Support

Si le problème persiste :

1. Collecter logs :
   ```bash
   sudo journalctl -u pttlive-server > /tmp/pttlive.log
   jack_lsp -c > /tmp/jack-connections.txt
   ```

2. Ouvrir une issue GitHub avec :
   - Description du problème
   - Logs serveur
   - Version OS (client et serveur)
   - Configuration audio (carte son, backend)

**GitHub Issues** : https://github.com/votre-user/ptt-live/issues

---

**Dernière mise à jour** : 2026-05-26
**Version** : 0.1.0 (Phase 3)
