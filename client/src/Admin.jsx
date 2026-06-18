import { useState, useEffect, useRef } from 'react';
import './Admin.css';
import AudioRoutingMatrix from './components/AudioRoutingMatrix';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function Admin() {
  // Lire l'onglet depuis l'URL hash (ex: #audio) ou utiliser 'groups' par défaut
  const getInitialTab = () => {
    const hash = window.location.hash.slice(1); // Enlever le #
    return ['groups', 'audio', 'users', 'stats', 'logs'].includes(hash) ? hash : 'groups';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab());
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Audio devices (Phase 2.5)
  const [audioDevices, setAudioDevices] = useState([]);
  const [currentDevice, setCurrentDevice] = useState({ inputChannels: 8, outputChannels: 8 });
  const [selectedInputDevice, setSelectedInputDevice] = useState(null);
  const [selectedOutputDevice, setSelectedOutputDevice] = useState(null);
  const [selectedSampleRate, setSelectedSampleRate] = useState(48000);
  const isEditingAudioRef = useRef(false);

  // Channel names (Phase 2.5)
  const [channelNames, setChannelNames] = useState({ inputs: {}, outputs: {} });

  // Gestion formulaire nouveau groupe
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupForm, setGroupForm] = useState({
    name: '',
    audioBitrate: 96
  });

  // Synchroniser l'onglet avec l'URL hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (['groups', 'audio', 'users', 'stats', 'logs'].includes(hash)) {
        setActiveTab(hash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Rafraîchissement automatique
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000); // Refresh toutes les 3s
    return () => clearInterval(interval);
  }, [activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);

      if (activeTab === 'groups') {
        await loadGroups();
      } else if (activeTab === 'users') {
        await loadUsers();
      } else if (activeTab === 'stats') {
        await loadStats();
      } else if (activeTab === 'logs') {
        await loadLogs();
      } else if (activeTab === 'audio') {
        await loadAudioDevices();
      }

      setError(null);
    } catch (err) {
      console.error('Erreur chargement données:', err);
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    const res = await fetch(`${API_URL}/admin/groups`);
    const data = await res.json();
    setGroups(data.groups || []);
  };

  const loadUsers = async () => {
    const res = await fetch(`${API_URL}/admin/users`);
    const data = await res.json();
    setUsers(data.users || []);
  };

  const loadStats = async () => {
    const res = await fetch(`${API_URL}/admin/stats`);
    const data = await res.json();
    setStats(data);
  };

  const loadLogs = async () => {
    const res = await fetch(`${API_URL}/admin/logs?limit=50`);
    const data = await res.json();
    setLogs(data.logs || []);
  };

  const loadAudioDevices = async () => {
    const [devicesRes, currentDeviceRes, channelNamesRes, groupsRes] = await Promise.all([
      fetch(`${API_URL}/admin/audio/devices`),
      fetch(`${API_URL}/admin/audio/device`),
      fetch(`${API_URL}/admin/audio/channels/names`),
      fetch(`${API_URL}/admin/groups`)
    ]);

    const devicesData = await devicesRes.json();
    const currentData = await currentDeviceRes.json();
    const channelNamesData = await channelNamesRes.json();
    const groupsData = await groupsRes.json();

    setAudioDevices(devicesData.devices || []);
    setGroups(groupsData.groups || []);

    const device = currentData.device || { inputChannels: 8, outputChannels: 8 };
    setCurrentDevice(device);
    setChannelNames(channelNamesData.channelNames || { inputs: {}, outputs: {} });

    // Ne réinitialiser les sélections que lors du chargement initial (pas en train d'éditer)
    if (!isEditingAudioRef.current) {
      setSelectedInputDevice(device.inputDeviceId ?? null);
      setSelectedOutputDevice(device.outputDeviceId ?? null);
      setSelectedSampleRate(device.sampleRate || 48000);
    }
  };

  // ========== Gestion groupes ==========

  const handleCreateGroup = async (e) => {
    e.preventDefault();

    try {
      const res = await fetch(`${API_URL}/admin/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(groupForm)
      });

      if (res.ok) {
        setShowGroupForm(false);
        resetGroupForm();
        await loadGroups();
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.error}`);
      }
    } catch (err) {
      console.error('Erreur création groupe:', err);
      alert('Erreur lors de la création du groupe');
    }
  };

  const handleUpdateGroup = async (e) => {
    e.preventDefault();

    try {
      const res = await fetch(`${API_URL}/admin/groups/${editingGroup}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(groupForm)
      });

      if (res.ok) {
        setEditingGroup(null);
        resetGroupForm();
        await loadGroups();
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.error}`);
      }
    } catch (err) {
      console.error('Erreur modification groupe:', err);
      alert('Erreur lors de la modification du groupe');
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce groupe ?')) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/admin/groups/${groupId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        await loadGroups();
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.error}`);
      }
    } catch (err) {
      console.error('Erreur suppression groupe:', err);
      alert('Erreur lors de la suppression du groupe');
    }
  };

  const startEditGroup = (group) => {
    setEditingGroup(group.id);
    setGroupForm({
      name: group.name,
      audioBitrate: group.audioBitrate || 96
    });
    setShowGroupForm(true);
  };

  const resetGroupForm = () => {
    setGroupForm({
      name: '',
      audioBitrate: 96
    });
    setShowGroupForm(false);
    setEditingGroup(null);
  };

  // ========== Gestion audio devices (Phase 2.5) ==========

  const handleSaveChannelNames = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/audio/channels/names`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channelNames)
      });

      if (res.ok) {
        alert('Noms de canaux sauvegardés avec succès!');
        await loadAudioDevices();
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.error}`);
      }
    } catch (err) {
      console.error('Erreur sauvegarde noms canaux:', err);
      alert('Erreur lors de la sauvegarde');
    }
  };

  const updateChannelName = (type, channelId, name) => {
    setChannelNames(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [channelId]: name
      }
    }));
  };

  const handleSaveAudioDevice = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/audio/device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputDeviceId: selectedInputDevice || undefined,
          outputDeviceId: selectedOutputDevice || undefined,
          sampleRate: parseInt(selectedSampleRate)
        })
      });

      if (res.ok) {
        isEditingAudioRef.current = false; // Désactiver le mode édition
        alert('Configuration audio sauvegardée avec succès!');
        await loadAudioDevices();
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.error}`);
      }
    } catch (err) {
      console.error('Erreur sauvegarde configuration audio:', err);
      alert('Erreur lors de la sauvegarde');
    }
  };

  // ========== Gestion utilisateurs ==========

  const handleDisconnectUser = async (identity) => {
    if (!confirm('Déconnecter cet utilisateur ?')) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/admin/users/${identity}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        await loadUsers();
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.error}`);
      }
    } catch (err) {
      console.error('Erreur déconnexion utilisateur:', err);
      alert('Erreur lors de la déconnexion');
    }
  };

  // ========== Render ==========

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('fr-FR');
  };

  const formatUptime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="admin-container">
      <header className="admin-header">
        <h1>PTT Live - Administration</h1>
        <a href="/" className="btn-back">← Retour</a>
      </header>

      <nav className="admin-tabs">
        <button
          className={activeTab === 'groups' ? 'active' : ''}
          onClick={() => { window.location.hash = 'groups'; setActiveTab('groups'); }}
        >
          Groupes
        </button>
        <button
          className={activeTab === 'audio' ? 'active' : ''}
          onClick={() => { window.location.hash = 'audio'; setActiveTab('audio'); }}
        >
          Audio
        </button>
        <button
          className={activeTab === 'users' ? 'active' : ''}
          onClick={() => { window.location.hash = 'users'; setActiveTab('users'); }}
        >
          Utilisateurs ({users.length})
        </button>
        <button
          className={activeTab === 'stats' ? 'active' : ''}
          onClick={() => { window.location.hash = 'stats'; setActiveTab('stats'); }}
        >
          Statistiques
        </button>
        <button
          className={activeTab === 'logs' ? 'active' : ''}
          onClick={() => { window.location.hash = 'logs'; setActiveTab('logs'); }}
        >
          Logs
        </button>
      </nav>

      <main className="admin-content">
        {error && (
          <div className="admin-error">
            {error}
          </div>
        )}

        {/* TAB: Groupes */}
        {activeTab === 'groups' && (
          <div className="tab-groups">
            <div className="tab-header">
              <h2>Gestion des groupes</h2>
              {!showGroupForm && (
                <button className="btn-primary" onClick={() => setShowGroupForm(true)}>
                  + Nouveau groupe
                </button>
              )}
            </div>

            {showGroupForm && (
              <div className="group-form-container">
                <form onSubmit={editingGroup ? handleUpdateGroup : handleCreateGroup}>
                  <h3>{editingGroup ? 'Modifier' : 'Nouveau'} groupe</h3>

                  <div className="form-row">
                    <label>
                      Nom du groupe
                      <input
                        type="text"
                        value={groupForm.name}
                        onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                        placeholder="ex: Production, Technique..."
                        required
                      />
                    </label>

                    <label>
                      Bitrate audio (kbps)
                      <input
                        type="number"
                        value={groupForm.audioBitrate}
                        onChange={(e) => setGroupForm({ ...groupForm, audioBitrate: parseInt(e.target.value) })}
                        min="32"
                        max="320"
                      />
                    </label>
                  </div>

                  <p style={{color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: 'var(--spacing-md)'}}>
                    Le routing audio se configure dans l'onglet "Audio" via la matrice de routing.
                  </p>

                  <div className="form-actions">
                    <button type="submit" className="btn-primary">
                      {editingGroup ? 'Modifier' : 'Créer'}
                    </button>
                    <button type="button" onClick={resetGroupForm} className="btn-secondary">
                      Annuler
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="groups-list">
              {groups.map(group => (
                <div key={group.id} className="group-card">
                  <div className="group-header">
                    <h3>{group.name}</h3>
                    <div className="group-actions">
                      <button onClick={() => startEditGroup(group)} className="btn-edit">
                        Modifier
                      </button>
                      <button onClick={() => handleDeleteGroup(group.id)} className="btn-delete">
                        Supprimer
                      </button>
                    </div>
                  </div>

                  <div className="group-info">
                    <span>Bitrate: {group.audioBitrate || 96} kbps</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: Audio (Phase 2.5) */}
        {activeTab === 'audio' && (
          <div className="tab-audio">
            <div className="tab-header">
              <h2>Configuration audio</h2>
            </div>

            <div className="audio-config-container">
              <div className="audio-section">
                <h3>Configuration des cartes son</h3>

                <div style={{display: 'grid', gap: 'var(--spacing-lg)', marginTop: 'var(--spacing-md)'}}>
                  <div>
                    <label style={{display: 'block', marginBottom: 'var(--spacing-xs)', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-secondary)'}}>
                      Carte son d'entrée (Input)
                    </label>
                    <select
                      value={selectedInputDevice ?? ''}
                      onChange={(e) => {
                        isEditingAudioRef.current = true;
                        setSelectedInputDevice(e.target.value === '' ? null : e.target.value);
                      }}
                      className="device-select"
                    >
                      <option value="">-- Sélectionner une carte --</option>
                      {audioDevices
                        .filter(d => d.maxInputChannels > 0)
                        .map((device, index) => (
                          <option key={`input-${device.id}-${index}`} value={device.id}>
                            {device.name} - {device.maxInputChannels} canaux - {device.defaultSampleRate}Hz
                          </option>
                        ))}
                    </select>
                    {selectedInputDevice !== null && selectedInputDevice !== '' && (
                      <p style={{marginTop: 'var(--spacing-sm)', color: 'var(--color-text-secondary)', fontSize: '0.85rem', wordBreak: 'break-all'}}>
                        Device ID: {selectedInputDevice}
                      </p>
                    )}
                  </div>

                  <div>
                    <label style={{display: 'block', marginBottom: 'var(--spacing-xs)', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-secondary)'}}>
                      Carte son de sortie (Output)
                    </label>
                    <select
                      value={selectedOutputDevice ?? ''}
                      onChange={(e) => {
                        isEditingAudioRef.current = true;
                        setSelectedOutputDevice(e.target.value === '' ? null : e.target.value);
                      }}
                      className="device-select"
                    >
                      <option value="">-- Sélectionner une carte --</option>
                      {audioDevices
                        .filter(d => d.maxOutputChannels > 0)
                        .map((device, index) => (
                          <option key={`output-${device.id}-${index}`} value={device.id}>
                            {device.name} - {device.maxOutputChannels} canaux - {device.defaultSampleRate}Hz
                          </option>
                        ))}
                    </select>
                    {selectedOutputDevice !== null && selectedOutputDevice !== '' && (
                      <p style={{marginTop: 'var(--spacing-sm)', color: 'var(--color-text-secondary)', fontSize: '0.85rem', wordBreak: 'break-all'}}>
                        Device ID: {selectedOutputDevice}
                      </p>
                    )}
                  </div>

                  <div>
                    <label style={{display: 'block', marginBottom: 'var(--spacing-xs)', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-secondary)'}}>
                      Sample Rate
                    </label>
                    <select
                      value={selectedSampleRate}
                      onChange={(e) => {
                        isEditingAudioRef.current = true;
                        setSelectedSampleRate(parseInt(e.target.value));
                      }}
                      className="device-select"
                    >
                      <option value={44100}>44100 Hz (CD quality)</option>
                      <option value={48000}>48000 Hz (Recommended)</option>
                      <option value={96000}>96000 Hz (High quality)</option>
                    </select>
                  </div>
                </div>

                <div className="audio-actions">
                  <button onClick={handleSaveAudioDevice} className="btn-primary">
                    Sauvegarder la configuration audio
                  </button>
                </div>
              </div>

              <div className="audio-section">
                <h3>Nommage des canaux physiques</h3>

                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-xl)', marginTop: 'var(--spacing-md)'}}>
                  <div>
                    <h4 style={{marginBottom: 'var(--spacing-md)', color: 'var(--color-text-secondary)'}}>
                      Entrées (Inputs) - {currentDevice.inputChannels || 0} canaux disponibles
                    </h4>
                    <div style={{display: 'grid', gap: 'var(--spacing-sm)'}}>
                      {Array.from({length: currentDevice.inputChannels || 8}, (_, i) => (
                        <div key={`input-${i}`} style={{display: 'grid', gridTemplateColumns: '40px 1fr', gap: 'var(--spacing-sm)', alignItems: 'center'}}>
                          <span style={{color: 'var(--color-text-secondary)', fontSize: '0.85rem'}}>{i}</span>
                          <input
                            type="text"
                            value={channelNames.inputs?.[i] || ''}
                            onChange={(e) => updateChannelName('inputs', i, e.target.value)}
                            placeholder={`Input ${i}`}
                            style={{
                              padding: 'var(--spacing-sm)',
                              background: 'var(--color-bg)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '6px',
                              color: 'var(--color-text)',
                              fontSize: '0.9rem'
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 style={{marginBottom: 'var(--spacing-md)', color: 'var(--color-text-secondary)'}}>
                      Sorties (Outputs) - {currentDevice.outputChannels || 0} canaux disponibles
                    </h4>
                    <div style={{display: 'grid', gap: 'var(--spacing-sm)'}}>
                      {Array.from({length: currentDevice.outputChannels || 8}, (_, i) => (
                        <div key={`output-${i}`} style={{display: 'grid', gridTemplateColumns: '40px 1fr', gap: 'var(--spacing-sm)', alignItems: 'center'}}>
                          <span style={{color: 'var(--color-text-secondary)', fontSize: '0.85rem'}}>{i}</span>
                          <input
                            type="text"
                            value={channelNames.outputs?.[i] || ''}
                            onChange={(e) => updateChannelName('outputs', i, e.target.value)}
                            placeholder={`Output ${i}`}
                            style={{
                              padding: 'var(--spacing-sm)',
                              background: 'var(--color-bg)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '6px',
                              color: 'var(--color-text)',
                              fontSize: '0.9rem'
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="audio-actions">
                  <button onClick={handleSaveChannelNames} className="btn-primary">
                    Sauvegarder les noms des canaux
                  </button>
                </div>
              </div>

              <AudioRoutingMatrix groups={groups} channelNames={channelNames} />

              {currentDevice && currentDevice.inputDeviceId && (
                <div className="current-config">
                  <h3>Configuration actuelle</h3>
                  <div className="config-info">
                    <p><strong>Input Device:</strong> {currentDevice.inputDeviceName || currentDevice.inputDeviceId}</p>
                    <p><strong>Output Device:</strong> {currentDevice.outputDeviceName || currentDevice.outputDeviceId}</p>
                    <p><strong>Sample Rate:</strong> {currentDevice.sampleRate ?? 48000} Hz</p>
                    <p><strong>Canaux:</strong> {currentDevice.inputChannels} entrées / {currentDevice.outputChannels} sorties</p>
                  </div>
                </div>
              )}

              <div className="audio-devices-list">
                <h3>Toutes les cartes son disponibles</h3>
                <table className="devices-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nom</th>
                      <th>Entrées</th>
                      <th>Sorties</th>
                      <th>Sample Rate</th>
                      <th>API</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audioDevices.map((device, index) => (
                      <tr key={`${device.id}-${index}`}>
                        <td style={{fontSize: '0.75rem', wordBreak: 'break-all', maxWidth: '200px'}}>{device.id}</td>
                        <td>{device.name}</td>
                        <td>{device.maxInputChannels}</td>
                        <td>{device.maxOutputChannels}</td>
                        <td>{device.defaultSampleRate} Hz</td>
                        <td>{device.hostAPIName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Utilisateurs */}
        {activeTab === 'users' && (
          <div className="tab-users">
            <h2>Utilisateurs connectés ({users.length})</h2>

            {users.length === 0 ? (
              <p className="empty-state">Aucun utilisateur connecté</p>
            ) : (
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Utilisateur</th>
                    <th>Groupe</th>
                    <th>Connecté depuis</th>
                    <th>Dernière activité</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.identity}>
                      <td>{user.username}</td>
                      <td><span className="group-badge">{user.groupId}</span></td>
                      <td>{formatDate(user.connectedAt)}</td>
                      <td>{formatDate(user.lastActivity)}</td>
                      <td>
                        <button
                          onClick={() => handleDisconnectUser(user.identity)}
                          className="btn-danger-small"
                        >
                          Déconnecter
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB: Statistiques */}
        {activeTab === 'stats' && stats && (
          <div className="tab-stats">
            <h2>Statistiques système</h2>

            <div className="stats-grid">
              <div className="stat-card">
                <h3>Connexions totales</h3>
                <div className="stat-value">{stats.totalConnections}</div>
              </div>

              <div className="stat-card">
                <h3>Connexions actives</h3>
                <div className="stat-value">{stats.activeConnections}</div>
              </div>

              <div className="stat-card">
                <h3>Uptime</h3>
                <div className="stat-value">{formatUptime(stats.uptime)}</div>
              </div>

              <div className="stat-card">
                <h3>Mémoire</h3>
                <div className="stat-value">
                  {Math.round(stats.memory.heapUsed / 1024 / 1024)} MB
                </div>
              </div>
            </div>

            {stats.audioStats && stats.audioStats.length > 0 && (
              <div className="audio-stats">
                <h3>Dernières stats audio</h3>
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Type</th>
                      <th>Données</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.audioStats.map((stat, index) => (
                      <tr key={index}>
                        <td>{formatDate(stat.timestamp)}</td>
                        <td>{stat.type || 'N/A'}</td>
                        <td><code>{JSON.stringify(stat, null, 2)}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: Logs */}
        {activeTab === 'logs' && (
          <div className="tab-logs">
            <h2>Logs serveur ({logs.length})</h2>

            {logs.length === 0 ? (
              <p className="empty-state">Aucun log disponible</p>
            ) : (
              <div className="logs-container">
                {logs.map((log, index) => (
                  <div key={index} className={`log-entry log-${log.level}`}>
                    <span className="log-timestamp">{formatDate(log.timestamp)}</span>
                    <span className="log-level">{log.level.toUpperCase()}</span>
                    <span className="log-message">{log.message}</span>
                    {log.meta && Object.keys(log.meta).length > 0 && (
                      <code className="log-meta">{JSON.stringify(log.meta)}</code>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default Admin;
