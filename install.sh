#!/bin/bash

# PTT Live - Script d'installation multi-OS
# Détecte automatiquement le système et lance l'installeur approprié

set -e

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=================================="
echo "🚀 PTT Live - Installation"
echo "==================================${NC}"
echo ""

# Détection du système d'exploitation
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo -e "${GREEN}📱 Système détecté : macOS${NC}"
  echo ""
  exec ./install/macos.sh
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  echo -e "${GREEN}🐧 Système détecté : Linux${NC}"
  echo ""
  exec ./install/linux.sh
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
  echo -e "${YELLOW}🪟 Système détecté : Windows${NC}"
  echo ""
  echo -e "${RED}❌ Windows n'est pas encore supporté (Phase 3)${NC}"
  echo ""
  echo "Plateformes supportées :"
  echo "  • macOS (via Homebrew)"
  echo "  • Linux (Debian/Ubuntu/Fedora)"
  echo ""
  exit 1
else
  echo -e "${RED}❌ Système non reconnu : $OSTYPE${NC}"
  echo ""
  echo "Plateformes supportées :"
  echo "  • macOS"
  echo "  • Linux"
  echo ""
  exit 1
fi
