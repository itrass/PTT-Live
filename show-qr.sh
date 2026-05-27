#!/bin/bash

# PTT Live - Affichage QR Code
# Génère et affiche le QR code pour connexion smartphone

set -e

# Couleurs
GREEN='\033[0;32m'
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

# Déterminer l'URL selon mode dev ou prod
if [ -d "client/dist" ] && [ "$1" != "--dev" ]; then
  # Mode production
  URL="http://${NETWORK_IP}:3000"
  MODE="production"
else
  # Mode dev
  URL="https://${NETWORK_IP}:5173"
  MODE="dev"
fi

echo ""
echo -e "${BLUE}=================================="
echo "📱 QR Code PTT Live ($MODE)"
echo "==================================${NC}"
echo ""

# Générer le QR code avec le package installé dans server/
(cd server && node -e "
const qrcode = require('qrcode-terminal');
qrcode.generate('$URL', { small: true });
")

echo ""
echo -e "${GREEN}🔗 URL : $URL${NC}"
echo ""
echo "📱 Scannez ce QR code depuis votre smartphone"
echo "   pour vous connecter instantanément"
echo ""
