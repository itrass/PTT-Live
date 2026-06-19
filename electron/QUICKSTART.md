# PTT Live Desktop - Quick Start Guide

## 🚀 Lancement en 30 secondes

```bash
# Depuis la racine du projet
./start-desktop.sh
```

C'est tout ! L'application démarre automatiquement le serveur.

---

## 📋 Checklist Première Utilisation

### 1. Vérifier le serveur

✅ Statut : **🟢 Actif** (coin haut-droit)
✅ Dashboard : stats doivent s'afficher sous 5s

### 2. Configurer l'audio

**Configuration → Périphériques Audio**

1. Sélectionner **Input Device** (carte son ou micro)
2. Sélectionner **Output Device** (haut-parleurs)
3. Cliquer **Appliquer**

💡 Les devices sont auto-détectés depuis votre système

### 3. Créer des groupes (optionnel)

**Groupes → ➕ Nouveau groupe**

1. Entrer un nom (ex: "Production")
2. Bitrate par défaut : 96 kbps (voix standard)
3. Sauvegarder

Les groupes sont enregistrés dans `server/config/config.yaml`

### 4. Connecter des clients

**Dashboard → QR Code**

1. Scanner le QR Code avec smartphone
2. OU copier l'URL et ouvrir dans navigateur

URL type : `https://192.168.1.10:5173`

---

## 🎯 Fonctionnalités Principales

### Dashboard

- **Stats** : uptime, utilisateurs, connexions
- **QR Code** : connexion rapide clients
- **Utilisateurs** : liste en temps réel

### Configuration

- **Audio** : devices, sample rate, bitrate, jitter buffer
- **Groupes** : créer/modifier/supprimer

### Monitoring

- **Logs** : serveur en temps réel, filtrables

---

## 🐛 Problèmes Courants

### Serveur ne démarre pas

**Symptôme** : statut reste "⚪ Arrêté"

**Solutions** :

1. Vérifier port 3000 libre :
   ```bash
   lsof -i :3000
   ```

2. Vérifier LiveKit installé :
   ```bash
   livekit-server --version
   # OU
   ls ../server/bin/livekit-server
   ```

3. Voir logs dans **Monitoring → Logs**

### QR Code ne s'affiche pas

**Symptôme** : zone blanche

**Solutions** :

1. Attendre 5-10s (génération après démarrage serveur)
2. Vérifier serveur actif (🟢)
3. Recharger : **Dashboard** → cliquer nav

### Pas d'audio

**Symptôme** : clients connectés mais pas de son

**Solutions** :

1. **Configuration** → vérifier devices sélectionnés
2. Vérifier permissions micro (système)
3. Tester avec devices différents

---

## ⌨️ Raccourcis

- `Cmd/Ctrl + R` : recharger interface
- `Cmd/Ctrl + Q` : quitter app
- `Cmd/Ctrl + Shift + I` : DevTools (debug)

---

## 📖 Documentation

- [DESKTOP-APP.md](DESKTOP-APP.md) : doc complète
- [README.md](../README.md) : vue d'ensemble projet
- [CLAUDE.md](../CLAUDE.md) : doc développement

---

## 🆘 Support

**Logs** : `Monitoring → Logs`
**DevTools** : `npm run dev` (dans terminal)
**Issues** : GitHub (si open source)

---

Bon intercom ! 🎙️
