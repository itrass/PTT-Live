#!/bin/bash

###############################################################################
# PTT Live - Script d'installation Linux
# Supporte : Ubuntu 22.04+, Debian 11+, Arch Linux
###############################################################################

set -e  # Arrête en cas d'erreur

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo ""
echo "========================================"
echo "  PTT Live - Installation Linux"
echo "========================================"
echo ""

# Détection de la distribution
detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO=$ID
        VERSION=$VERSION_ID
    else
        echo "Erreur : impossible de détecter la distribution Linux"
        exit 1
    fi

    echo "Distribution détectée : $DISTRO $VERSION"
}

# Installation des dépendances système
install_system_deps() {
    echo ""
    echo "Installation des dépendances système..."

    case $DISTRO in
        ubuntu|debian)
            echo "Distribution : Debian/Ubuntu"

            # Mise à jour des paquets
            sudo apt update

            # Dépendances de base
            sudo apt install -y \
                curl \
                git \
                build-essential \
                pkg-config

            # Node.js (via NodeSource si pas déjà installé)
            if ! command -v node &> /dev/null; then
                echo "Installation de Node.js 20.x..."
                curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
                sudo apt install -y nodejs
            else
                echo "Node.js déjà installé : $(node --version)"
            fi

            # Backend audio : PipeWire (recommandé pour Ubuntu 22.04+)
            if [ "${VERSION%%.*}" -ge 22 ]; then
                echo "Installation de PipeWire (backend audio moderne)..."
                sudo apt install -y \
                    pipewire \
                    pipewire-pulse \
                    pipewire-jack \
                    wireplumber \
                    pipewire-audio-client-libraries

                # Outils PipeWire
                sudo apt install -y \
                    pipewire-bin \
                    libspa-0.2-jack

                # Démarrage automatique
                systemctl --user enable --now pipewire pipewire-pulse wireplumber
                echo "PipeWire démarré et activé au démarrage"
            else
                echo "Version Ubuntu < 22.04 : installation de JACK..."
                install_jack_debian
            fi

            # Outils JACK optionnels (compatibilité)
            sudo apt install -y \
                jack-tools \
                qjackctl || true

            echo "Dépendances système installées !"
            ;;

        arch|manjaro)
            echo "Distribution : Arch Linux"

            # Mise à jour des paquets
            sudo pacman -Syu --noconfirm

            # Dépendances de base
            sudo pacman -S --needed --noconfirm \
                base-devel \
                git \
                curl \
                nodejs \
                npm

            # PipeWire (installé par défaut sur Arch moderne)
            sudo pacman -S --needed --noconfirm \
                pipewire \
                pipewire-pulse \
                pipewire-jack \
                wireplumber \
                pipewire-alsa

            # Outils audio
            sudo pacman -S --needed --noconfirm \
                jack2 \
                qjackctl || true

            # Activation PipeWire
            systemctl --user enable --now pipewire pipewire-pulse wireplumber
            echo "PipeWire démarré et activé au démarrage"

            echo "Dépendances système installées !"
            ;;

        fedora)
            echo "Distribution : Fedora"

            sudo dnf install -y \
                nodejs \
                npm \
                gcc-c++ \
                make \
                pipewire \
                pipewire-jack-audio-connection-kit \
                pipewire-pulseaudio \
                wireplumber

            systemctl --user enable --now pipewire pipewire-pulse wireplumber
            echo "Dépendances système installées !"
            ;;

        *)
            echo "Distribution non supportée automatiquement : $DISTRO"
            echo "Installez manuellement :"
            echo "  - Node.js 18+"
            echo "  - PipeWire ou JACK"
            exit 1
            ;;
    esac
}

# Installation de JACK (fallback pour anciennes versions)
install_jack_debian() {
    echo "Installation de JACK Audio Connection Kit..."
    sudo apt install -y \
        jackd2 \
        jack-tools \
        qjackctl

    # Configuration JACK pour basse latence
    sudo usermod -a -G audio $USER
    echo "JACK installé. Vous devrez peut-être redémarrer pour appliquer les permissions audio."
}

# Téléchargement de LiveKit Server
install_livekit_server() {
    echo ""
    echo "Téléchargement de LiveKit Server..."

    LIVEKIT_VERSION="v1.5.2"
    LIVEKIT_DIR="$PROJECT_ROOT/server/bin"
    LIVEKIT_BINARY="$LIVEKIT_DIR/livekit-server"

    mkdir -p "$LIVEKIT_DIR"

    # Détection de l'architecture
    ARCH=$(uname -m)
    case $ARCH in
        x86_64)
            LIVEKIT_ARCH="amd64"
            ;;
        aarch64|arm64)
            LIVEKIT_ARCH="arm64"
            ;;
        *)
            echo "Architecture non supportée : $ARCH"
            exit 1
            ;;
    esac

    LIVEKIT_URL="https://github.com/livekit/livekit/releases/download/${LIVEKIT_VERSION}/livekit_${LIVEKIT_VERSION}_linux_${LIVEKIT_ARCH}.tar.gz"

    echo "Téléchargement depuis : $LIVEKIT_URL"

    cd "$LIVEKIT_DIR"
    curl -L -o livekit.tar.gz "$LIVEKIT_URL"
    tar -xzf livekit.tar.gz
    rm livekit.tar.gz

    chmod +x livekit-server

    echo "LiveKit Server installé : $LIVEKIT_BINARY"
    echo "Version : $($LIVEKIT_BINARY --version)"
}

# Installation des dépendances Node.js
install_node_deps() {
    echo ""
    echo "Installation des dépendances Node.js..."

    # Serveur
    echo "Serveur..."
    cd "$PROJECT_ROOT/server"
    npm install

    # Client
    echo "Client..."
    cd "$PROJECT_ROOT/client"
    npm install

    echo "Dépendances Node.js installées !"
}

# Configuration réseau et génération .env
configure_network() {
    echo ""
    echo "Configuration réseau..."

    # Détection IP réseau
    NETWORK_IP=$(hostname -I | awk '{print $1}')

    if [ -z "$NETWORK_IP" ]; then
        echo "⚠️  IP réseau non détectée, utilisation localhost"
        NETWORK_IP="localhost"
    else
        echo "✓ IP réseau détectée : ${NETWORK_IP}"
    fi

    # Générer .env serveur
    echo "Génération configuration serveur..."

    cat > "$PROJECT_ROOT/server/.env" << EOF
# Configuration PTT Live Server
# Généré automatiquement par install/linux.sh

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

    echo "✓ Configuration serveur générée (server/.env)"

    # Générer .env client
    echo "Génération configuration client..."

    cat > "$PROJECT_ROOT/client/.env" << EOF
# Configuration PTT Live Client
# Généré automatiquement par install/linux.sh

# En développement local, utilise le proxy Vite
VITE_API_URL=/api

# Pour accès réseau (autres devices), décommentez et mettez l'IP du serveur :
# VITE_API_URL=http://${NETWORK_IP}:3000
EOF

    echo "✓ Configuration client générée (client/.env)"
}

# Configuration audio
configure_audio() {
    echo ""
    echo "========================================"
    echo "  Configuration audio"
    echo "========================================"

    # Vérification PipeWire
    if systemctl --user is-active --quiet pipewire; then
        echo "PipeWire : ACTIF"
        pw-cli info 0 | head -n 5
    else
        echo "PipeWire : INACTIF"
        echo "Démarrez-le : systemctl --user start pipewire pipewire-pulse"
    fi

    # Vérification JACK (si installé)
    if command -v jack_lsp &> /dev/null; then
        echo ""
        echo "JACK : Installé"
        if jack_lsp &> /dev/null; then
            echo "Serveur JACK : ACTIF"
        else
            echo "Serveur JACK : INACTIF"
            echo "Démarrez-le : jackd -d alsa -r 48000"
        fi
    fi

    echo ""
    echo "Backend audio recommandé : PipeWire"
    echo "Pour démarrer le serveur PTT Live, voir README.md"
}

# Résumé final
print_summary() {
    echo ""
    echo "========================================"
    echo "  ✅ Installation terminée !"
    echo "========================================"
    echo ""
    echo "📝 Prochaines étapes :"
    echo ""
    echo "1. Démarrer le serveur :"
    echo "   cd $PROJECT_ROOT/server"
    echo "   npm run dev"
    echo ""
    echo "2. Démarrer le client (autre terminal) :"
    echo "   cd $PROJECT_ROOT/client"
    echo "   npm run dev"
    echo ""
    echo "3. Accéder à l'application :"
    echo "   • Développement local : http://localhost:5173"
    echo "   • Depuis autre appareil (WiFi) : http://${NETWORK_IP}:5173"
    echo ""
    echo "💡 Configuration réseau :"
    echo "   IP serveur détectée : ${NETWORK_IP}"
    echo "   LiveKit URL : AUTO (détection dynamique)"
    echo ""
    echo "📖 Documentation :"
    echo "   • README.md - Guide complet"
    echo "   • README-PORTABLE.md - Déploiement portable"
    echo ""
    echo "========================================"
    echo ""
}

# Script principal
main() {
    detect_distro
    install_system_deps
    install_livekit_server
    install_node_deps
    configure_network
    configure_audio
    print_summary
}

main "$@"
