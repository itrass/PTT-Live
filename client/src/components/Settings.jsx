import { useState, useEffect } from 'react';
import './Settings.css';

const STORAGE_KEY = 'ptt-live-settings';

const defaultSettings = {
  defaultPTTMode: 'normal', // 'normal' ou 'continuous'
  vibrationEnabled: true,
  audioFeedbackEnabled: true
};

/**
 * Charge les paramètres depuis localStorage
 */
export function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error('Erreur chargement paramètres:', error);
  }
  return defaultSettings;
}

/**
 * Sauvegarde les paramètres dans localStorage
 */
export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Erreur sauvegarde paramètres:', error);
  }
}

/**
 * Composant modal de paramètres
 */
export default function Settings({ isOpen, onClose }) {
  const [settings, setSettings] = useState(defaultSettings);

  useEffect(() => {
    if (isOpen) {
      setSettings(loadSettings());
    }
  }, [isOpen]);

  const handleChange = (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Paramètres</h2>
          <button className="close-btn" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
            </svg>
          </button>
        </div>

        <div className="settings-content">
          <div className="setting-section">
            <h3>Mode PTT</h3>
            <p className="setting-description">
              Choisissez le mode de fonctionnement par défaut du bouton PTT
            </p>

            <label className="radio-option">
              <input
                type="radio"
                name="pttMode"
                checked={settings.defaultPTTMode === 'normal'}
                onChange={() => handleChange('defaultPTTMode', 'normal')}
              />
              <div>
                <strong>Mode normal (Push-To-Talk)</strong>
                <p>Maintenir le bouton pour parler, relâcher pour arrêter</p>
              </div>
            </label>

            <label className="radio-option">
              <input
                type="radio"
                name="pttMode"
                checked={settings.defaultPTTMode === 'continuous'}
                onChange={() => handleChange('defaultPTTMode', 'continuous')}
              />
              <div>
                <strong>Mode continu (verrouillé)</strong>
                <p>Un appui active le micro en continu, un second appui le désactive</p>
              </div>
            </label>
          </div>

          <div className="setting-section">
            <h3>Feedback</h3>

            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={settings.vibrationEnabled}
                onChange={(e) => handleChange('vibrationEnabled', e.target.checked)}
              />
              <div>
                <strong>Vibrations</strong>
                <p>Activer le retour haptique (si disponible)</p>
              </div>
            </label>

            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={settings.audioFeedbackEnabled}
                onChange={(e) => handleChange('audioFeedbackEnabled', e.target.checked)}
              />
              <div>
                <strong>Feedback audio</strong>
                <p>Sons de confirmation pour les actions</p>
              </div>
            </label>
          </div>
        </div>

        <div className="settings-footer">
          <button className="btn-primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
