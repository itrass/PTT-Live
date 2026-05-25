import { useState, useEffect } from 'react';
import './PWAInstallPrompt.css';

/**
 * Composant pour afficher un message d'onboarding PWA
 * Spécialement pour iOS qui nécessite l'installation manuelle
 */
export default function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Détecter iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(iOS);

    // Détecter si déjà en mode standalone (installé)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone
      || document.referrer.includes('android-app://');
    setIsStandalone(standalone);

    // Vérifier si l'utilisateur a déjà vu le prompt
    const hasSeenPrompt = localStorage.getItem('pwa-install-prompt-seen');

    // Afficher le prompt si iOS, pas installé, et jamais vu
    if (iOS && !standalone && !hasSeenPrompt) {
      // Afficher après 3 secondes pour ne pas être intrusif
      setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
    }
  }, []);

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-prompt-seen', 'true');
  };

  if (!showPrompt || !isIOS || isStandalone) {
    return null;
  }

  return (
    <div className="pwa-prompt-overlay">
      <div className="pwa-prompt">
        <div className="pwa-prompt-header">
          <h3>Installation requise pour les notifications</h3>
          <button className="pwa-prompt-close" onClick={handleDismiss}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
            </svg>
          </button>
        </div>

        <div className="pwa-prompt-content">
          <p>
            Pour recevoir les notifications d'appels, vous devez installer l'application sur votre écran d'accueil.
          </p>

          <div className="pwa-prompt-steps">
            <div className="pwa-prompt-step">
              <div className="step-number">1</div>
              <p>Appuyez sur le bouton <strong>Partager</strong></p>
              <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z"/>
              </svg>
            </div>

            <div className="pwa-prompt-step">
              <div className="step-number">2</div>
              <p>Sélectionnez <strong>Sur l'écran d'accueil</strong></p>
            </div>

            <div className="pwa-prompt-step">
              <div className="step-number">3</div>
              <p>Tapez <strong>Ajouter</strong></p>
            </div>
          </div>
        </div>

        <div className="pwa-prompt-footer">
          <button className="btn-primary" onClick={handleDismiss}>
            J'ai compris
          </button>
        </div>
      </div>
    </div>
  );
}
