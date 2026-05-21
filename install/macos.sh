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

# Télécharger LiveKit Server
LIVEKIT_VERSION="v1.7.2"
LIVEKIT_URL="https://github.com/livekit/livekit/releases/download/${LIVEKIT_VERSION}/livekit_${LIVEKIT_VERSION}_darwin_amd64.tar.gz"
LIVEKIT_ARM_URL="https://github.com/livekit/livekit/releases/download/${LIVEKIT_VERSION}/livekit_${LIVEKIT_VERSION}_darwin_arm64.tar.gz"

echo "📥 Téléchargement LiveKit Server ${LIVEKIT_VERSION}..."

# Détecter architecture (Intel vs Apple Silicon)
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    echo "   Architecture: Apple Silicon (ARM64)"
    DOWNLOAD_URL=$LIVEKIT_ARM_URL
else
    echo "   Architecture: Intel (AMD64)"
    DOWNLOAD_URL=$LIVEKIT_URL
fi

cd server/bin

if [ -f "livekit-server" ]; then
    echo -e "${YELLOW}⚠️  LiveKit Server déjà présent, suppression...${NC}"
    rm -f livekit-server
fi

# Télécharger et extraire
curl -L -o livekit.tar.gz "$DOWNLOAD_URL"
tar -xzf livekit.tar.gz
rm livekit.tar.gz

# Rendre exécutable
chmod +x livekit-server

echo -e "${GREEN}✅ LiveKit Server installé${NC}"
echo ""

cd ../..

# Installer dépendances serveur
echo "📦 Installation dépendances serveur..."
cd server
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

# Générer clés API LiveKit
echo "🔑 Génération clés API LiveKit..."
API_KEY="APIkey$(openssl rand -hex 16)"
API_SECRET=$(openssl rand -base64 32)

# Créer fichier .env
cat > server/.env << EOF
# LiveKit Configuration
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=$API_KEY
LIVEKIT_API_SECRET=$API_SECRET

# Server Configuration
PORT=3000
NODE_ENV=development
EOF

echo -e "${GREEN}✅ Clés API générées (server/.env)${NC}"
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
echo "   3. Ouvrir https://localhost:5173 dans votre navigateur"
echo ""
echo "📖 Documentation : README.md"
echo ""
