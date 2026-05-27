import { useState, useEffect } from 'react';
import useLiveKit from './hooks/useLiveKit';
import usePush from './hooks/usePush';
import PTTButton from './components/PTTButton';
import UserList from './components/UserList';
import GroupSelector from './components/GroupSelector';
import Settings from './components/Settings';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function App() {
  const [username, setUsername] = useState('');
  const [groupId, setGroupId] = useState('');
  const [groups, setGroups] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const {
    isConnected,
    participants,
    isTalking,
    audioLevel,
    connect,
    disconnect,
    switchGroup,
    startTalking,
    stopTalking,
    toggleParticipantMute
  } = useLiveKit();

  const {
    isSupported: isPushSupported,
    isPermissionGranted: isPushGranted,
    requestPermission: requestPushPermission,
    showNotification
  } = usePush();

  // Charger configuration au démarrage
  useEffect(() => {
    fetch(`${API_URL}/config`)
      .then(res => res.json())
      .then(data => {
        setGroups(data.groups || []);
        if (data.groups.length > 0) {
          setGroupId(data.groups[0].id);
        }
      })
      .catch(err => {
        console.error('Erreur chargement config:', err);
        setError('Impossible de charger la configuration');
      });
  }, []);

  const handleConnect = async () => {
    if (!username.trim()) {
      setError('Veuillez entrer votre nom');
      return;
    }

    if (!groupId) {
      setError('Veuillez sélectionner un groupe');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Demander permission notifications au premier lancement
      if (isPushSupported && !isPushGranted) {
        console.log('Demande permission notifications...');
        await requestPushPermission();
      }

      // IMPORTANT iOS : Demander permission microphone AVANT tout
      console.log('🎤 Demande permission microphone...');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log('✓ Permission microphone accordée');
        // Arrêter le stream test immédiatement
        stream.getTracks().forEach(track => track.stop());
      } catch (permErr) {
        console.error('❌ Permission microphone refusée:', permErr);
        throw new Error('Accès microphone refusé. Autorisez dans les réglages iOS : Safari > Microphone.');
      }

      // Obtenir token du serveur
      const response = await fetch(`${API_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, groupId })
      });

      if (!response.ok) {
        throw new Error('Erreur serveur');
      }

      const data = await response.json();

      // Utiliser directement l'URL LiveKit fournie par le serveur
      const livekitUrl = data.url;

      console.log('🔗 Connexion LiveKit:', livekitUrl);
      console.log('📝 Token:', data.token.substring(0, 50) + '...');

      // Se connecter à LiveKit avec les canaux virtuels
      await connect(livekitUrl, data.token, data.virtualChannels || []);

    } catch (err) {
      console.error('Erreur connexion:', err);

      // Message d'erreur spécifique selon le type
      if (err.message && err.message.includes('Microphone')) {
        setError(err.message);
      } else {
        setError('Connexion impossible. Vérifiez le serveur et les permissions microphone.');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setError(null);
  };

  const handleGroupChange = async (newGroupId) => {
    console.log('🔄 Changement de groupe:', groupId, '→', newGroupId);

    try {
      // Obtenir nouveau token pour le nouveau groupe
      const response = await fetch(`${API_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, groupId: newGroupId })
      });

      if (!response.ok) {
        throw new Error('Erreur serveur');
      }

      const data = await response.json();

      // Adapter l'URL LiveKit selon le protocole de la page
      let livekitUrl = data.url;
      if (window.location.protocol === 'https:') {
        livekitUrl = `${window.location.protocol}//${window.location.host}/livekit`;
      }

      // Changer de room LiveKit avec les canaux virtuels du nouveau groupe
      await switchGroup(livekitUrl, data.token, data.virtualChannels || []);

      // Mettre à jour l'état
      setGroupId(newGroupId);
      console.log('✓ Groupe changé avec succès');

    } catch (err) {
      console.error('Erreur changement de groupe:', err);
      throw err; // Propager l'erreur au composant GroupSelector
    }
  };

  // Interface de connexion
  if (!isConnected) {
    return (
      <div className="app">
        <div className="login-container">
          <div className="login-card">
            <h1 className="app-title">PTT Live</h1>
            <p className="app-subtitle">Professional Intercom</p>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="username">Nom</label>
              <input
                id="username"
                type="text"
                placeholder="Votre nom"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleConnect()}
                disabled={isConnecting}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="group">Groupe</label>
              <select
                id="group"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                disabled={isConnecting || groups.length === 0}
              >
                {groups.length === 0 ? (
                  <option>Chargement...</option>
                ) : (
                  groups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <button
              className="btn-primary"
              onClick={handleConnect}
              disabled={isConnecting || !username.trim() || !groupId}
            >
              {isConnecting ? 'Connexion...' : 'Se connecter'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Interface principale PTT
  return (
    <div className="app">
      <header className="app-header">
        <div className="header-info">
          <h2>{username}</h2>
          <p className="text-secondary">
            {groups.find(g => g.id === groupId)?.name || groupId}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn-icon"
            onClick={() => setShowSettings(true)}
            title="Paramètres"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
            </svg>
          </button>
          <button
            className="btn-disconnect"
            onClick={handleDisconnect}
          >
            Déconnexion
          </button>
        </div>
      </header>

      <main className="app-main">
        {/* Sélecteur de groupe */}
        <GroupSelector
          currentGroupId={groupId}
          onGroupChange={handleGroupChange}
          apiUrl={API_URL}
        />

        {/* Liste des participants */}
        <UserList
          participants={participants}
          onToggleMute={toggleParticipantMute}
        />

        {/* Bouton PTT principal avec VU-mètre intégré */}
        <PTTButton
          isTalking={isTalking}
          onPressStart={startTalking}
          onPressEnd={stopTalking}
          audioLevel={audioLevel}
        />
      </main>

      {/* Modal de paramètres */}
      <Settings isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Prompt installation PWA (iOS) */}
      <PWAInstallPrompt />
    </div>
  );
}

export default App;
