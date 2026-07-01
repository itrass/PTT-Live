/**
 * PTT Live Desktop - Renderer Process Logic
 */

const API_BASE = window.electronAPI?.serverUrl || 'http://localhost:3000';

// État global
let serverRunning = false;
let statsInterval = null;
let logsBuffer = [];
let audioLevelsWS = null;
let audioLevelsData = {
  inputs: {},
  groups: {},
  outputs: {},
  routing: {
    activeInputs: [],
    activeGroups: [],
    activeOutputs: []
  }
};

// ========== Initialisation ==========

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Interface Electron chargée');

  // Setup navigation
  setupNavigation();

  // Setup contrôles serveur
  setupServerControls();

  // Setup logs listener
  setupLogsListener();

  // Vérifier le statut initial du serveur
  await checkServerStatus();

  // Charger les données initiales SEULEMENT si serveur actif
  if (serverRunning) {
    loadInitialData();
  } else {
    console.log('⏸️  Serveur arrêté, en attente de démarrage...');
  }
});

// ========== Navigation ==========

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetView = item.dataset.view;

      // Mettre à jour l'état actif
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      views.forEach(view => view.classList.remove('active'));
      document.getElementById(`view-${targetView}`).classList.add('active');

      // Charger les données de la vue
      loadViewData(targetView);
    });
  });
}

// ========== Contrôles Serveur ==========

function setupServerControls() {
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');

  btnStart.addEventListener('click', async () => {
    btnStart.disabled = true;
    btnStart.textContent = 'Démarrage...';

    try {
      const result = await window.electronAPI.server.start();
      console.log('Résultat démarrage:', result);

      if (result.success) {
        showNotification('Serveur démarré avec succès', 'success');
      } else {
        showNotification('Erreur démarrage: ' + result.message, 'error');
      }
    } catch (error) {
      console.error('Erreur démarrage serveur:', error);
      showNotification('Erreur démarrage serveur', 'error');
    }

    btnStart.disabled = false;
    btnStart.textContent = 'Démarrer';

    await checkServerStatus();
  });

  btnStop.addEventListener('click', async () => {
    btnStop.disabled = true;
    btnStop.textContent = 'Arrêt...';

    try {
      const result = await window.electronAPI.server.stop();
      console.log('Résultat arrêt:', result);

      if (result.success) {
        showNotification('Serveur arrêté', 'info');
      }
    } catch (error) {
      console.error('Erreur arrêt serveur:', error);
      showNotification('Erreur arrêt serveur', 'error');
    }

    btnStop.disabled = false;
    btnStop.textContent = 'Arrêter';

    await checkServerStatus();
  });

  // Listener status depuis Main Process
  window.electronAPI.server.onStatus((data) => {
    console.log('Status update:', data);
    updateServerStatus(data.running);
  });
}

function setupLogsListener() {
  window.electronAPI.server.onLog((logData) => {
    addLogEntry(logData);
  });

  // Bouton clear logs
  document.getElementById('btn-clear-logs').addEventListener('click', () => {
    logsBuffer = [];
    renderLogs();
  });

  // Filtre niveau de log
  document.getElementById('log-level-filter').addEventListener('change', (e) => {
    renderLogs(e.target.value);
  });
}

async function checkServerStatus() {
  try {
    const status = await window.electronAPI.server.status();
    console.log('Status:', status);
    updateServerStatus(status.running);

    if (status.running) {
      startStatsPolling();
    } else {
      stopStatsPolling();
    }
  } catch (error) {
    console.error('Erreur check status:', error);
    updateServerStatus(false);
  }
}

function updateServerStatus(running) {
  serverRunning = running;

  const indicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');

  if (running) {
    indicator.textContent = '🟢';
    statusText.textContent = 'Actif';
    btnStart.disabled = true;
    btnStop.disabled = false;

    // Démarrer le polling
    startStatsPolling();

    // Connecter WebSocket audio levels
    connectAudioLevelsWS();

    // Charger les données initiales
    loadInitialData();
  } else {
    indicator.textContent = '⚪';
    statusText.textContent = 'Arrêté';
    btnStart.disabled = false;
    btnStop.disabled = true;

    // Arrêter le polling
    stopStatsPolling();

    // Déconnecter WebSocket audio levels
    disconnectAudioLevelsWS();

    // QR code obsolète tant que le serveur est arrêté : revenir au placeholder
    document.getElementById('qr-code').removeAttribute('src');
    document.getElementById('client-url').textContent = '--';
  }
}

// ========== Polling Stats ==========

function startStatsPolling() {
  if (statsInterval) return;

  // Poll toutes les 2 secondes
  statsInterval = setInterval(async () => {
    if (serverRunning) {
      await fetchStats();
      await fetchUsers();
    }
  }, 2000);

  // Premier fetch immédiat
  fetchStats();
  fetchUsers();
}

function stopStatsPolling() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}

// ========== API Calls ==========

async function apiCall(endpoint) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    return null;
  }
}

async function fetchStats() {
  const data = await apiCall('/admin/stats');
  if (!data) return;

  // Mettre à jour les stats cards
  document.getElementById('stat-uptime').textContent = formatUptime(data.uptime);
  document.getElementById('stat-users').textContent = data.activeConnections || 0;
  document.getElementById('stat-total-connections').textContent = data.totalConnections || 0;

  // Groupes actifs (nécessite /admin/groups)
  const groups = await apiCall('/admin/groups');
  if (groups) {
    document.getElementById('stat-groups').textContent = groups.groups?.length || 0;
  }
}

async function fetchUsers() {
  const data = await apiCall('/admin/users');
  if (!data) return;

  const container = document.getElementById('users-list');

  if (!data.users || data.users.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucun utilisateur connecté</p>';
    return;
  }

  container.innerHTML = data.users.map(user => `
    <div class="user-item">
      <div class="user-info">
        <span class="user-status">👤</span>
        <div class="user-details">
          <h4>${user.username}</h4>
          <p>Groupe: ${user.groupId} • Connecté: ${formatTime(user.connectedAt)}</p>
        </div>
      </div>
      <div class="user-badge">${user.groupId}</div>
    </div>
  `).join('');
}

async function fetchDevices() {
  const data = await apiCall('/admin/devices/list');
  if (!data) return;

  const inputSelect = document.getElementById('input-device');
  const outputSelect = document.getElementById('output-device');

  // Remplir les selects
  inputSelect.innerHTML = data.inputs.map(device =>
    `<option value="${device.id}" ${device.isDefault ? 'selected' : ''}>
      ${device.name} ${device.channels ? `(${device.channels}ch)` : ''}
    </option>`
  ).join('');

  outputSelect.innerHTML = data.outputs.map(device =>
    `<option value="${device.id}" ${device.isDefault ? 'selected' : ''}>
      ${device.name} ${device.channels ? `(${device.channels}ch)` : ''}
    </option>`
  ).join('');
}

async function fetchGroups() {
  const data = await apiCall('/admin/groups');
  if (!data) return;

  const container = document.getElementById('groups-list');

  if (!data.groups || data.groups.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucun groupe configuré</p>';
    return;
  }

  container.innerHTML = data.groups.map(group => {
    const id = slugify(group.name);
    return `
    <div class="group-item">
      <div class="group-info">
        <h4>${escapeHtml(group.name)}</h4>
        <p>Bitrate: ${group.audioBitrate || 96} kbps • ID: ${escapeHtml(id)}</p>
      </div>
      <div class="group-actions">
        <button class="btn btn-small btn-secondary"
          data-action="edit"
          data-id="${escapeHtml(id)}"
          data-name="${escapeHtml(group.name)}"
          data-bitrate="${group.audioBitrate || 96}">Modifier</button>
        <button class="btn btn-small btn-danger"
          data-action="delete"
          data-id="${escapeHtml(id)}"
          data-name="${escapeHtml(group.name)}">Supprimer</button>
      </div>
    </div>
  `;
  }).join('');
}

async function editGroup(id, currentName, currentBitrate) {
  const newName = prompt('Nom du groupe:', currentName);
  if (newName === null || newName.trim() === '') return;

  const newBitrateStr = prompt('Bitrate (kbps, 32-320):', String(currentBitrate));
  if (newBitrateStr === null) return;

  const newBitrate = parseInt(newBitrateStr);
  if (isNaN(newBitrate) || newBitrate < 32 || newBitrate > 320) {
    showNotification('Bitrate invalide (32-320 kbps)', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/admin/groups/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), audioBitrate: newBitrate })
    });

    if (response.ok) {
      showNotification('Groupe modifié', 'success');
      await fetchGroups();
    } else {
      const err = await response.json().catch(() => ({}));
      showNotification('Erreur: ' + (err.error || 'Modification échouée'), 'error');
    }
  } catch (error) {
    console.error('Erreur edit group:', error);
    showNotification('Erreur réseau', 'error');
  }
}

async function deleteGroup(id, name) {
  if (!confirm(`Supprimer le groupe "${name}" ?`)) return;

  try {
    const response = await fetch(`${API_BASE}/admin/groups/${id}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      showNotification('Groupe supprimé', 'success');
      await fetchGroups();
    } else {
      const err = await response.json().catch(() => ({}));
      showNotification('Erreur: ' + (err.error || 'Suppression échouée'), 'error');
    }
  } catch (error) {
    console.error('Erreur delete group:', error);
    showNotification('Erreur réseau', 'error');
  }
}

async function fetchConfig() {
  const data = await apiCall('/admin/config');
  if (!data) return;

  // Remplir les champs de config audio
  if (data.audio) {
    const sampleRateSelect = document.getElementById('sample-rate');
    if (sampleRateSelect) {
      sampleRateSelect.value = data.audio.sampleRate || 48000;
    }

    const bitrateInput = document.getElementById('default-bitrate');
    if (bitrateInput) {
      bitrateInput.value = data.audio.defaultBitrate || 96;
    }

    const jitterInput = document.getElementById('jitter-buffer');
    if (jitterInput) {
      jitterInput.value = data.audio.jitterBufferMs || 40;
    }
  }
}

// ========== QR Code ==========

async function generateQRCode() {
  // Récupérer l'IP réseau depuis le serveur
  const status = await window.electronAPI.server.status();
  if (!status || !status.running) {
    document.getElementById('client-url').textContent = 'Serveur non démarré';
    return;
  }

  // Récupérer l'URL depuis l'API
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();

    // Détecter l'IP réseau (depuis hostname ou config)
    const networkIP = await getNetworkIP();
    // En prod (Electron), le client buildé est servi par le serveur Express
    // lui-même (même port que l'API), pas par Vite (port 5173, dev only)
    // API_BASE pointe sur 127.0.0.1 (loopback, pour le ping interne) :
    // on ne réutilise que protocole + port, l'IP doit être celle du réseau local
    const serverOrigin = new URL(API_BASE);
    const clientUrl = `${serverOrigin.protocol}//${networkIP}:${serverOrigin.port}`;

    document.getElementById('client-url').textContent = clientUrl;

    // Générer QR Code (rendu côté Main Process, pas de dépendance réseau/CDN)
    const img = document.getElementById('qr-code');
    if (img) {
      const result = await window.electronAPI.generateQRCode(clientUrl);
      if (result.success) {
        img.src = result.dataUrl;
        console.log('✅ QR Code généré');
      } else {
        console.error('Erreur génération QR Code:', result.error);
      }
    }
  } catch (error) {
    console.error('Erreur récupération URL:', error);
    document.getElementById('client-url').textContent = API_BASE;
  }

  // Bouton copier URL (setup une seule fois)
  const btnCopy = document.getElementById('btn-copy-url');
  if (btnCopy && !btnCopy.dataset.initialized) {
    btnCopy.dataset.initialized = 'true';
    btnCopy.addEventListener('click', () => {
      const url = document.getElementById('client-url').textContent;
      navigator.clipboard.writeText(url);
      showNotification('URL copiée !', 'success');
    });
  }
}

async function getNetworkIP() {
  // Détection via le Main Process (même logique que pour les certs mkcert) :
  // /admin/config renvoie la valeur YAML brute ("AUTO"), jamais l'IP résolue,
  // donc inutilisable ici.
  try {
    const ip = await window.electronAPI.getNetworkIP();
    if (ip) return ip;
  } catch (error) {
    console.error('Erreur détection IP:', error);
  }

  // Fallback : localhost
  return 'localhost';
}

// ========== Logs ==========

function addLogEntry(logData) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: logData.level || 'info',
    message: logData.message
  };

  logsBuffer.unshift(entry);

  // Garder max 500 logs
  if (logsBuffer.length > 500) {
    logsBuffer = logsBuffer.slice(0, 500);
  }

  renderLogs();
}

function renderLogs(levelFilter = '') {
  const container = document.getElementById('logs-container');

  let logs = logsBuffer;

  // Filtrer par niveau si nécessaire
  if (levelFilter) {
    logs = logs.filter(log => log.level === levelFilter);
  }

  if (logs.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucun log</p>';
    return;
  }

  container.innerHTML = logs.map(log => `
    <div class="log-entry">
      <span class="log-time">${formatLogTime(log.timestamp)}</span>
      <span class="log-level ${log.level}">${log.level}</span>
      <span class="log-message">${escapeHtml(log.message)}</span>
    </div>
  `).join('');

  // Scroll vers le bas (dernier log)
  container.scrollTop = 0;
}

// ========== Chargement données ==========

async function loadInitialData() {
  if (!serverRunning) return;

  await fetchStats();
  await fetchUsers();
  await generateQRCode();
}

async function loadViewData(view) {
  if (!serverRunning) return;

  switch (view) {
    case 'dashboard':
      await fetchStats();
      await fetchUsers();
      await generateQRCode();
      break;
    case 'config':
      await fetchDevices();
      await fetchConfig();
      break;
    case 'groups':
      await fetchGroups();
      break;
    case 'monitoring':
      renderVUMeters();
      break;
    case 'logs':
      renderLogs();
      break;
  }
}

// ========== Boutons de sauvegarde ==========

document.addEventListener('DOMContentLoaded', () => {
  // Sauvegarder device audio
  const btnSaveDevice = document.getElementById('btn-save-device');
  if (btnSaveDevice) {
    btnSaveDevice.addEventListener('click', async () => {
      const inputDeviceId = document.getElementById('input-device').value;
      const outputDeviceId = document.getElementById('output-device').value;

      try {
        const response = await fetch(`${API_BASE}/admin/audio/device`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputDeviceId, outputDeviceId })
        });

        if (response.ok) {
          showNotification('Périphérique audio configuré', 'success');
        } else {
          showNotification('Erreur configuration', 'error');
        }
      } catch (error) {
        console.error('Erreur save device:', error);
        showNotification('Erreur réseau', 'error');
      }
    });
  }

  // Sauvegarder config audio
  const btnSaveAudio = document.getElementById('btn-save-audio');
  if (btnSaveAudio) {
    btnSaveAudio.addEventListener('click', async () => {
      const sampleRate = parseInt(document.getElementById('sample-rate').value);
      const defaultBitrate = parseInt(document.getElementById('default-bitrate').value);
      const jitterBufferMs = parseInt(document.getElementById('jitter-buffer').value);

      try {
        const response = await fetch(`${API_BASE}/admin/config/audio`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sampleRate, defaultBitrate, jitterBufferMs })
        });

        if (response.ok) {
          showNotification('Configuration sauvegardée', 'success');
        } else {
          showNotification('Erreur sauvegarde', 'error');
        }
      } catch (error) {
        console.error('Erreur save config:', error);
        showNotification('Erreur réseau', 'error');
      }
    });
  }

  // Ajouter groupe
  const btnAddGroup = document.getElementById('btn-add-group');
  if (btnAddGroup) {
    btnAddGroup.addEventListener('click', async () => {
      const name = prompt('Nom du groupe:');
      if (!name) return;

      try {
        const response = await fetch(`${API_BASE}/admin/groups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, audioBitrate: 96 })
        });

        if (response.ok) {
          showNotification('Groupe créé', 'success');
          await fetchGroups();
        } else {
          showNotification('Erreur création groupe', 'error');
        }
      } catch (error) {
        console.error('Erreur add group:', error);
        showNotification('Erreur réseau', 'error');
      }
    });
  }

  // Exporter config.yaml
  const btnExportConfig = document.getElementById('btn-export-config');
  if (btnExportConfig) {
    btnExportConfig.addEventListener('click', async () => {
      const result = await window.electronAPI.config.export();
      if (result.success) {
        showNotification('Configuration exportée', 'success');
      } else if (!result.cancelled) {
        showNotification('Erreur export: ' + (result.error || 'Échec'), 'error');
      }
    });
  }

  // Importer config.yaml
  const btnImportConfig = document.getElementById('btn-import-config');
  if (btnImportConfig) {
    btnImportConfig.addEventListener('click', async () => {
      const result = await window.electronAPI.config.import();
      if (result.success) {
        showNotification('Configuration importée - Redémarrez le serveur pour appliquer', 'warning');
        if (serverRunning) {
          await fetchConfig();
        }
      } else if (!result.cancelled) {
        showNotification('Erreur import: ' + (result.error || 'Échec'), 'error');
      }
    });
  }

  // Exporter les logs
  const btnExportLogs = document.getElementById('btn-export-logs');
  if (btnExportLogs) {
    btnExportLogs.addEventListener('click', () => {
      const levelFilter = document.getElementById('log-level-filter').value;
      const logs = levelFilter ? logsBuffer.filter(l => l.level === levelFilter) : logsBuffer;

      if (logs.length === 0) {
        showNotification('Aucun log à exporter', 'info');
        return;
      }

      const content = JSON.stringify(logs, null, 2);
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `ptt-live-logs-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showNotification(`${logs.length} logs exportés`, 'success');
    });
  }

  // Délégation d'événements pour modifier/supprimer un groupe
  const groupsList = document.getElementById('groups-list');
  if (groupsList) {
    groupsList.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const name = btn.dataset.name;

      if (action === 'edit') {
        await editGroup(id, name, parseInt(btn.dataset.bitrate));
      } else if (action === 'delete') {
        await deleteGroup(id, name);
      }
    });
  }
});

// ========== Helpers ==========

function slugify(text) {
  return text.toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-');
}

function formatUptime(seconds) {
  if (!seconds) return '--';

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  return `${h}h ${m}m ${s}s`;
}

// ========== WebSocket Audio Levels ==========

function connectAudioLevelsWS() {
  if (audioLevelsWS && audioLevelsWS.readyState === WebSocket.OPEN) {
    console.log('WebSocket audio-levels déjà connecté');
    return;
  }

  const wsUrl = API_BASE.replace(/^http/, 'ws') + '/audio-levels';
  console.log('Connexion WebSocket audio-levels...', wsUrl);

  try {
    audioLevelsWS = new WebSocket(wsUrl);

    audioLevelsWS.onopen = () => {
      console.log('WebSocket audio-levels connecté');
      updateVUMetersStatus('Connecté');
    };

    audioLevelsWS.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'initial':
          case 'levels':
            audioLevelsData = message.data;
            renderVUMeters();
            break;

          case 'pong':
            break;

          default:
            console.warn('Message WebSocket inconnu:', message.type);
        }
      } catch (error) {
        console.error('Erreur parsing message WebSocket:', error);
      }
    };

    audioLevelsWS.onerror = (error) => {
      console.error('Erreur WebSocket audio-levels:', error);
      updateVUMetersStatus('Erreur de connexion');
    };

    audioLevelsWS.onclose = () => {
      console.log('WebSocket audio-levels déconnecté');
      audioLevelsWS = null;
      updateVUMetersStatus('Déconnecté');

      // Reconnexion automatique si serveur actif
      if (serverRunning) {
        setTimeout(() => {
          connectAudioLevelsWS();
        }, 3000);
      }
    };

    // Ping périodique
    const pingInterval = setInterval(() => {
      if (audioLevelsWS && audioLevelsWS.readyState === WebSocket.OPEN) {
        audioLevelsWS.send(JSON.stringify({ type: 'ping' }));
      } else {
        clearInterval(pingInterval);
      }
    }, 10000);

  } catch (error) {
    console.error('Erreur création WebSocket:', error);
    updateVUMetersStatus('Erreur de connexion');
  }
}

function disconnectAudioLevelsWS() {
  if (audioLevelsWS) {
    audioLevelsWS.close();
    audioLevelsWS = null;
  }
}

function updateVUMetersStatus(status) {
  const container = document.getElementById('vu-meters');
  if (!container) return;

  const statusEl = container.querySelector('.vu-status');
  if (statusEl) {
    statusEl.textContent = `WebSocket: ${status}`;
    statusEl.className = `vu-status ${status === 'Connecté' ? 'connected' : 'disconnected'}`;
  }
}

function renderVUMeters() {
  const container = document.getElementById('vu-meters');
  if (!container) return;

  const hasData =
    Object.keys(audioLevelsData.inputs).length > 0 ||
    Object.keys(audioLevelsData.groups).length > 0 ||
    Object.keys(audioLevelsData.outputs).length > 0;

  if (!hasData) {
    container.innerHTML = `
      <p class="vu-status">WebSocket: En attente de connexion...</p>
      <p class="empty-state">Aucune donnée audio disponible</p>
    `;
    return;
  }

  let html = '<div class="vu-status connected">WebSocket: Connecté</div>';

  // Inputs
  if (Object.keys(audioLevelsData.inputs).length > 0) {
    html += '<div class="vu-section"><h4>Entrées Audio</h4><div class="vu-grid">';
    Object.entries(audioLevelsData.inputs).forEach(([channelId, data]) => {
      html += renderVUMeter(channelId, data, 'input');
    });
    html += '</div></div>';
  }

  // Groups
  if (Object.keys(audioLevelsData.groups).length > 0) {
    html += '<div class="vu-section"><h4>Groupes</h4><div class="vu-grid">';
    Object.entries(audioLevelsData.groups).forEach(([groupName, data]) => {
      html += renderVUMeter(groupName, data, 'group');
    });
    html += '</div></div>';
  }

  // Outputs
  if (Object.keys(audioLevelsData.outputs).length > 0) {
    html += '<div class="vu-section"><h4>Sorties Audio</h4><div class="vu-grid">';
    Object.entries(audioLevelsData.outputs).forEach(([channelId, data]) => {
      html += renderVUMeter(channelId, data, 'output');
    });
    html += '</div></div>';
  }

  container.innerHTML = html;
}

function renderVUMeter(label, data, type) {
  const { rms, peak, clipping } = data;

  // Convertir dBFS en pourcentage pour la barre (0dB = 100%, -60dB = 0%)
  const rmsPercent = Math.max(0, Math.min(100, ((rms + 60) / 60) * 100));
  const peakPercent = Math.max(0, Math.min(100, ((peak * 60 - 60 + 60) / 60) * 100));

  // Couleur selon le niveau
  let barClass = 'vu-bar-green';
  if (rms > -6) barClass = 'vu-bar-red';
  else if (rms > -12) barClass = 'vu-bar-yellow';

  const clippingClass = clipping ? 'vu-meter-clipping' : '';

  return `
    <div class="vu-meter ${clippingClass}">
      <div class="vu-label">${escapeHtml(label)}</div>
      <div class="vu-bar-container">
        <div class="vu-bar ${barClass}" style="width: ${rmsPercent}%"></div>
        <div class="vu-peak" style="left: ${peakPercent}%"></div>
      </div>
      <div class="vu-values">
        <span class="vu-rms">${rms.toFixed(1)} dB</span>
        ${clipping ? '<span class="vu-clip">CLIP!</span>' : ''}
      </div>
    </div>
  `;
}

function formatTime(isoString) {
  if (!isoString) return '--';
  const date = new Date(isoString);
  return date.toLocaleTimeString('fr-FR');
}

function formatLogTime(isoString) {
  if (!isoString) return '--';
  const date = new Date(isoString);
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);

  const container = document.getElementById('toast-container');
  if (!container) return;

  // Icônes par type
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  // Créer le toast
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close">×</button>
  `;

  // Ajouter au container
  container.appendChild(toast);

  // Bouton fermer
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    toast.remove();
  });

  // Auto-remove après 5 secondes
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);
}
