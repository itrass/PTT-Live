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

# Créer fichier .env
echo "🔑 Génération configuration LiveKit..."

cat > server/.env << EOF
USE_LOCAL_LIVEKIT=true

# LiveKit Configuration
LIVEKIT_URL=ws://localhost:7880
# En mode --dev, LiveKit utilise ces clés par défaut
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret

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
