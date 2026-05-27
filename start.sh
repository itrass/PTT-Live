#!/bin/bash

# PTT Live - Script de démarrage unifié
# Lance le serveur et le client en mode production

set -e

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Détection IP réseau
get_network_ip() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    hostname -I | awk '{print $1}'
  else
    echo "localhost"
  fi
}

NETWORK_IP=$(get_network_ip)

echo -e "${BLUE}=================================="
echo "🚀 PTT Live - Démarrage"
echo "==================================${NC}"
echo ""

echo -e "${GREEN}📡 IP réseau détectée : ${NETWORK_IP}${NC}"
echo ""

# Vérifier que les dépendances sont installées
if [ ! -d "server/node_modules" ]; then
  echo -e "${RED}❌ Dépendances serveur manquantes${NC}"
  echo "   Exécutez d'abord : ./install/macos.sh (ou linux.sh)"
  exit 1
fi

if [ ! -d "client/node_modules" ]; then
  echo -e "${RED}❌ Dépendances client manquantes${NC}"
  echo "   Exécutez d'abord : ./install/macos.sh (ou linux.sh)"
  exit 1
fi

# Créer fichier PID pour cleanup
PID_FILE="/tmp/ptt-live.pid"

# Fonction cleanup
cleanup() {
  echo ""
  echo -e "${YELLOW}⏹  Arrêt PTT Live...${NC}"

  if [ -f "$PID_FILE" ]; then
    while read -r pid; do
      if ps -p "$pid" > /dev/null 2>&1; then
        kill "$pid" 2>/dev/null || true
      fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
  fi

  echo -e "${GREEN}✓ Arrêté${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Démarrer le serveur en arrière-plan
echo -e "${BLUE}🔧 Démarrage serveur...${NC}"
cd server
npm start > ../server.log 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"
cd ..

echo -e "${GREEN}✓ Serveur démarré (PID: $SERVER_PID)${NC}"

# Attendre que le serveur soit prêt
echo -e "${YELLOW}⏳ Attente démarrage serveur...${NC}"
for i in {1..30}; do
  if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Serveur prêt${NC}"
    break
  fi

  if [ $i -eq 30 ]; then
    echo -e "${RED}❌ Timeout : le serveur n'a pas démarré${NC}"
    echo "   Consultez server.log pour plus de détails"
    exit 1
  fi

  sleep 1
done

echo ""

# Build client si pas déjà fait ou mode dev
if [ "$1" == "--dev" ]; then
  echo -e "${BLUE}🎨 Démarrage client (dev)...${NC}"
  cd client
  npm run dev &
  CLIENT_PID=$!
  echo "$CLIENT_PID" >> "$PID_FILE"
  cd ..

  echo -e "${GREEN}✓ Client dev démarré${NC}"
  echo ""
  echo -e "${GREEN}=================================="
  echo "✅ PTT Live démarré (mode dev)"
  echo "==================================${NC}"
  echo ""
  echo "🌐 Accès :"
  echo "   • Local : https://localhost:5173"
  echo "   • Réseau : https://${NETWORK_IP}:5173"
  echo ""
  echo "📊 API serveur : http://${NETWORK_IP}:3000"
  echo "🎛️  Interface admin : http://${NETWORK_IP}:3000/admin"
  echo ""
  echo -e "${YELLOW}Appuyez sur Ctrl+C pour arrêter${NC}"
  echo ""

  # Attendre indéfiniment
  wait

else
  # Mode production : build et serve
  echo -e "${BLUE}🎨 Build client production...${NC}"
  cd client

  if [ ! -d "dist" ] || [ "$1" == "--rebuild" ]; then
    npm run build
    echo -e "${GREEN}✓ Client buildé${NC}"
  else
    echo -e "${YELLOW}⚠️  Build existant utilisé (--rebuild pour forcer)${NC}"
  fi

  cd ..

  echo ""
  echo -e "${GREEN}=================================="
  echo "✅ PTT Live démarré (production)"
  echo "==================================${NC}"
  echo ""
  echo "🌐 Accès :"
  echo "   • Local : http://localhost:3000"
  echo "   • Réseau : http://${NETWORK_IP}:3000"
  echo ""
  echo "🎛️  Interface admin : http://${NETWORK_IP}:3000/admin"
  echo ""
  echo "📝 Logs serveur : tail -f server.log"
  echo ""
  echo -e "${YELLOW}Appuyez sur Ctrl+C pour arrêter${NC}"
  echo ""

  # Attendre indéfiniment
  wait
fi
