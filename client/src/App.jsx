import { useState, useEffect } from 'react';
import useLiveKit from './hooks/useLiveKit';
import PTTButton from './components/PTTButton';
import UserList from './components/UserList';
import GroupSelector from './components/GroupSelector';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function App() {
  const [username, setUsername] = useState('');
  const [groupId, setGroupId] = useState('');
  const [groups, setGroups] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

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

      // Adapter l'URL LiveKit selon le protocole de la page
      let livekitUrl = data.url;
      if (window.location.protocol === 'https:') {
        // En HTTPS, utiliser le proxy WSS local via Vite
        livekitUrl = `${window.location.protocol}//${window.location.host}/livekit`;
      }

      console.log('🔗 Connexion LiveKit:', livekitUrl);

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
        <button
          className="btn-disconnect"
          onClick={handleDisconnect}
        >
          Déconnexion
        </button>
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
    </div>
  );
}

export default App;
