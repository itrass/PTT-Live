#!/bin/bash

# PTT Live - Configuration Certificats SSL Locaux
# Génère des certificats auto-signés DE CONFIANCE pour développement local

set -e

echo "🔐 Configuration Certificats SSL Locaux PTT Live"
echo ""

# Détection OS
OS="$(uname -s)"

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ========== Installation mkcert ==========

echo "📦 Vérification mkcert..."

if ! command -v mkcert &> /dev/null; then
    echo -e "${YELLOW}⚠️  mkcert non installé${NC}"
    echo ""
    echo "Installation de mkcert (génère certificats de confiance)..."
    echo ""

    if [[ "$OS" == "Darwin" ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install mkcert
            brew install nss # Pour Firefox
        else
            echo -e "${RED}❌ Homebrew requis sur macOS${NC}"
            echo "Installez Homebrew : https://brew.sh"
            exit 1
        fi
    elif [[ "$OS" == "Linux" ]]; then
        # Linux
        if command -v apt-get &> /dev/null; then
            # Debian/Ubuntu
            sudo apt-get update
            sudo apt-get install -y libnss3-tools

            # Télécharger mkcert
            curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
            chmod +x mkcert-v*-linux-amd64
            sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
        elif command -v yum &> /dev/null; then
            # RedHat/CentOS
            sudo yum install -y nss-tools

            curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
            chmod +x mkcert-v*-linux-amd64
            sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
        else
            echo -e "${RED}❌ Gestionnaire de paquets non supporté${NC}"
            echo "Installez mkcert manuellement : https://github.com/FiloSottile/mkcert"
            exit 1
        fi
    else
        echo -e "${RED}❌ OS non supporté : $OS${NC}"
        exit 1
    fi

    echo -e "${GREEN}✅ mkcert installé${NC}"
    echo ""
else
    echo -e "${GREEN}✅ mkcert déjà installé${NC}"
    echo ""
fi

# ========== Installation CA Locale ==========

echo "🔑 Installation Certificate Authority (CA) locale..."
echo ""
echo "⚠️  Ceci va ajouter une CA locale au système"
echo "    Les certificats générés seront automatiquement approuvés"
echo ""

# Installer la CA locale (une seule fois par machine)
mkcert -install

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ CA locale installée${NC}"
else
    echo -e "${RED}❌ Erreur installation CA${NC}"
    exit 1
fi

echo ""

# ========== Génération Certificats ==========

echo "📜 Génération certificats pour PTT Live..."
echo ""

# Détecter l'IP réseau
if [[ "$OS" == "Darwin" ]]; then
    # macOS
    NETWORK_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || echo "192.168.1.100")
elif [[ "$OS" == "Linux" ]]; then
    # Linux
    NETWORK_IP=$(ip route get 1 | awk '{print $7; exit}' || echo "192.168.1.100")
fi

echo "🌐 IP réseau détectée : $NETWORK_IP"
echo ""

# Créer répertoire certificats
CERT_DIR="$(pwd)/certs"
mkdir -p "$CERT_DIR"

cd "$CERT_DIR"

# Générer certificats pour :
# - localhost
# - IP réseau locale
# - *.local (wildcard)

echo "Génération certificats pour :"
echo "  - localhost"
echo "  - $NETWORK_IP"
echo "  - *.local"
echo ""

mkcert \
    localhost \
    127.0.0.1 \
    ::1 \
    "$NETWORK_IP" \
    "*.local" \
    "$(hostname).local"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Certificats générés dans : $CERT_DIR${NC}"
    echo ""

    # Renommer pour simplifier
    mv localhost+*.pem localhost.pem 2>/dev/null || true
    mv localhost+*-key.pem localhost-key.pem 2>/dev/null || true

    echo "📁 Fichiers créés :"
    ls -lh "$CERT_DIR"/*.pem
else
    echo -e "${RED}❌ Erreur génération certificats${NC}"
    exit 1
fi

echo ""

# ========== Configuration Serveur ==========

echo "⚙️  Configuration automatique du serveur..."
echo ""

# Créer/mettre à jour .env serveur
SERVER_ENV="$(pwd)/../server/.env"

if [ -f "$SERVER_ENV" ]; then
    # Backup
    cp "$SERVER_ENV" "$SERVER_ENV.backup"
    echo "💾 Backup : $SERVER_ENV.backup"
fi

# Détecter les fichiers de certificats générés
CERT_FILE=$(ls "$CERT_DIR"/localhost.pem 2>/dev/null || ls "$CERT_DIR"/*+*.pem | head -1)
KEY_FILE=$(ls "$CERT_DIR"/localhost-key.pem 2>/dev/null || ls "$CERT_DIR"/*-key.pem | head -1)

if [ -z "$CERT_FILE" ] || [ -z "$KEY_FILE" ]; then
    echo -e "${RED}❌ Certificats introuvables${NC}"
    exit 1
fi

# Mettre à jour .env avec chemins absolus
cat > "$SERVER_ENV" << EOF
# PTT Live Server - Configuration
# Généré automatiquement par setup-certificates.sh

# LiveKit Local
USE_LOCAL_LIVEKIT=true
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
LIVEKIT_URL=AUTO

# Serveur
PORT=3000
ENABLE_HTTPS=true

# Certificats SSL (chemins absolus)
SSL_CERT=$CERT_FILE
SSL_KEY=$KEY_FILE

# Réseau
NETWORK_IP=$NETWORK_IP
EOF

echo -e "${GREEN}✅ .env serveur mis à jour${NC}"
echo ""

# ========== Configuration Client ==========

echo "⚙️  Configuration client..."
echo ""

CLIENT_ENV="$(pwd)/../client/.env"

cat > "$CLIENT_ENV" << EOF
# PTT Live Client - Configuration
# Généré automatiquement par setup-certificates.sh

VITE_SERVER_URL=https://$NETWORK_IP:3000
EOF

echo -e "${GREEN}✅ .env client créé${NC}"
echo ""

# ========== Mettre à jour Vite Config ==========

echo "⚙️  Configuration Vite HTTPS..."
echo ""

VITE_CONFIG="$(pwd)/../client/vite.config.js"

cat > "$VITE_CONFIG" << EOF
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'PTT Live',
        short_name: 'PTT Live',
        description: 'Professional WebRTC Intercom',
        theme_color: '#1a1a1a',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: {
      key: fs.readFileSync(path.resolve(__dirname, '../certs/$KEY_FILE')),
      cert: fs.readFileSync(path.resolve(__dirname, '../certs/$CERT_FILE'))
    }
  }
});
EOF

echo -e "${GREEN}✅ vite.config.js mis à jour avec HTTPS${NC}"
echo ""

# ========== Mettre à jour serveur index.js ==========

echo "⚙️  Configuration serveur Express HTTPS..."
echo ""

# Le serveur lira SSL_CERT et SSL_KEY depuis .env
# Pas besoin de modifier index.js si déjà compatible

echo -e "${GREEN}✅ Configuration terminée${NC}"
echo ""

# ========== Récapitulatif ==========

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ CONFIGURATION CERTIFICATS TERMINÉE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📜 Certificats générés :"
echo "   $CERT_DIR"
echo ""
echo "🌐 URLs d'accès :"
echo ""
echo "   Serveur :  https://$NETWORK_IP:3000"
echo "   Client :   https://$NETWORK_IP:5173"
echo ""
echo "🔐 Les certificats sont automatiquement approuvés par :"
echo "   - Chrome/Edge/Safari"
echo "   - Firefox (si nss installé)"
echo "   - Système d'exploitation"
echo ""
echo "📱 Scan QR Code au démarrage pour connexion rapide"
echo ""
echo "🚀 Démarrer le système :"
echo ""
echo "   ./start.sh --dev"
echo "   # OU"
echo "   ./start-desktop.sh"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Pour smartphones iOS/Android :"
echo ""
echo "   1. Scanner le QR Code affiché au démarrage"
echo "   2. Accepter le certificat (une seule fois)"
echo "   3. Installer la PWA sur l'écran d'accueil"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
