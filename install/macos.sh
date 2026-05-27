#!/bin/bash

set -e

echo "🚀 PTT Live - Installation macOS"
echo "=================================="
echo ""

# Couleurs pour le terminal
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Vérifier Node.js
echo "📦 Vérification Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js n'est pas installé${NC}"
    echo "   Installez Node.js 20+ depuis https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}❌ Node.js version trop ancienne ($NODE_VERSION)${NC}"
    echo "   Node.js 20+ requis"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node -v)${NC}"

# Vérifier npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm n'est pas installé${NC}"
    exit 1
fi

echo -e "${GREEN}✅ npm $(npm -v)${NC}"
echo ""

# Vérifier Homebrew
echo "🍺 Vérification Homebrew..."
if ! command -v brew &> /dev/null; then
    echo -e "${RED}❌ Homebrew n'est pas installé${NC}"
    echo "   Installez Homebrew depuis https://brew.sh"
    echo "   Ou exécutez :"
    echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    exit 1
fi

echo -e "${GREEN}✅ Homebrew $(brew --version | head -n 1)${NC}"
echo ""

# Installer sox (audio backend stable pour macOS)
echo "🎵 Installation sox (audio backend)..."
if command -v sox &> /dev/null; then
    echo -e "${GREEN}✅ sox déjà installé ($(sox --version | head -n 1))${NC}"
else
    brew install sox
    echo -e "${GREEN}✅ sox installé${NC}"
fi
echo ""

# Installer LiveKit Server via Homebrew
echo "📥 Installation LiveKit Server..."
if command -v livekit-server &> /dev/null; then
    CURRENT_VERSION=$(livekit-server --version 2>&1 | head -n 1 || echo "version inconnue")
    echo -e "${YELLOW}⚠️  LiveKit Server déjà installé ($CURRENT_VERSION)${NC}"
    read -p "   Mettre à jour ? (o/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Oo]$ ]]; then
        brew upgrade livekit
        echo -e "${GREEN}✅ LiveKit Server mis à jour${NC}"
    else
        echo -e "${GREEN}✅ LiveKit Server existant conservé${NC}"
    fi
else
    brew install livekit
    echo -e "${GREEN}✅ LiveKit Server installé${NC}"
fi
echo ""

# Installer dépendances serveur
echo "📦 Installation dépendances serveur..."
cd ../server
npm install
echo -e "${GREEN}✅ Dépendances serveur installées${NC}"
echo ""

# Installer dépendances client
echo "📦 Installation dépendances client..."
cd ../client
npm install
echo -e "${GREEN}✅ Dépendances client installées${NC}"
echo ""

cd ..

# Détecter l'IP réseau locale
echo "🌐 Détection configuration réseau..."
NETWORK_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)

if [ -z "$NETWORK_IP" ]; then
    echo -e "${YELLOW}⚠️  IP réseau non détectée, utilisation localhost${NC}"
    NETWORK_IP="localhost"
else
    echo -e "${GREEN}✅ IP réseau détectée : ${NETWORK_IP}${NC}"
fi
echo ""

# Créer fichier .env serveur
echo "🔑 Génération configuration serveur..."

cat > server/.env << EOF
# Configuration PTT Live Server
# Généré automatiquement par install/macos.sh

USE_LOCAL_LIVEKIT=true

# LiveKit Configuration
# AUTO = détection automatique IP réseau au démarrage
LIVEKIT_URL=AUTO
# En mode --dev, LiveKit utilise ces clés par défaut
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret

# Server Configuration
PORT=3000
NODE_ENV=development
EOF

echo -e "${GREEN}✅ Configuration serveur générée (server/.env)${NC}"

# Créer fichier .env client
echo "🔑 Génération configuration client..."

cat > client/.env << EOF
# Configuration PTT Live Client
# Généré automatiquement par install/macos.sh

# En développement local, utilise le proxy Vite
VITE_API_URL=/api

# Pour accès réseau (autres devices), décommentez et mettez l'IP du serveur :
# VITE_API_URL=http://${NETWORK_IP}:3000
EOF

echo -e "${GREEN}✅ Configuration client générée (client/.env)${NC}"
echo ""

# Message final
echo "=================================="
echo -e "${GREEN}✅ Installation terminée !${NC}"
echo ""
echo "📝 Prochaines étapes :"
echo ""
echo "   1. Démarrer le serveur :"
echo "      cd server && npm run dev"
echo ""
echo "   2. Démarrer le client (nouveau terminal) :"
echo "      cd client && npm run dev"
echo ""
echo "   3. Accéder à l'application :"
echo "      • Développement local : https://localhost:5173"
echo "      • Depuis autre appareil (WiFi) : https://${NETWORK_IP}:5173"
echo ""
echo "💡 Configuration réseau :"
echo "   IP serveur détectée : ${NETWORK_IP}"
echo "   LiveKit URL : AUTO (détection dynamique)"
echo ""
echo "📖 Documentation :"
echo "   • README.md - Guide complet"
echo "   • README-PORTABLE.md - Déploiement portable"
echo ""
