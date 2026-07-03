/**
 * PTT Live Desktop - Renderer Process Logic
 */

const API_BASE = window.electronAPI?.serverUrl || 'http://localhost:3000';

// État global
let serverRunning = false;
let statsInterval = null;
let logsBuffer = [];
let audioLevelsWS = null;
let routingData = null;
let deviceChannels = null;
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
  const container = document.getElementById('groups-list');

  // Lecture directe depuis config.yaml via IPC (fonctionne sans serveur)
  const data = await window.electronAPI.groups.list();

  if (!data.groups || data.groups.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucun groupe configuré</p>';
    return;
  }

  const serverNote = serverRunning ? '' : '<p class="config-note" style="margin-bottom:1rem">Serveur arrêté — les modifications seront appliquées au prochain démarrage.</p>';

  container.innerHTML = serverNote + data.groups.map(group => {
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
  const result = await showModal({
    title: 'Modifier le groupe',
    fields: [
      { name: 'name', label: 'Nom', default: currentName },
      { name: 'bitrate', label: 'Bitrate (kbps)', type: 'number', default: currentBitrate, min: 32, max: 320, step: 1 }
    ],
    confirmLabel: 'Modifier'
  });

  if (!result) return;

  const newName = result.name.trim();
  const newBitrate = parseInt(result.bitrate);

  if (!newName) { showNotification('Nom requis', 'error'); return; }
  if (isNaN(newBitrate) || newBitrate < 32 || newBitrate > 320) {
    showNotification('Bitrate invalide (32-320 kbps)', 'error');
    return;
  }

  try {
    let ok, errorMsg;

    if (serverRunning) {
      const response = await fetch(`${API_BASE}/admin/groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, audioBitrate: newBitrate })
      });
      ok = response.ok;
      if (!ok) errorMsg = (await response.json().catch(() => ({}))).error;
    } else {
      const res = await window.electronAPI.groups.update({ id, name: newName, audioBitrate: newBitrate });
      ok = res.success;
      errorMsg = res.error;
    }

    if (ok) {
      showNotification('Groupe modifié', 'success');
      await fetchGroups();
    } else {
      showNotification('Erreur: ' + (errorMsg || 'Modification échouée'), 'error');
    }
  } catch (error) {
    console.error('Erreur edit group:', error);
    showNotification('Erreur réseau', 'error');
  }
}

async function deleteGroup(id, name) {
  const confirmed = await showModal({
    title: 'Supprimer le groupe',
    message: `Supprimer le groupe "${name}" ? Cette action est irréversible.`,
    confirmLabel: 'Supprimer',
    confirmClass: 'btn-danger'
  });

  if (!confirmed) return;

  try {
    let ok, errorMsg;

    if (serverRunning) {
      const response = await fetch(`${API_BASE}/admin/groups/${id}`, { method: 'DELETE' });
      ok = response.ok;
      if (!ok) errorMsg = (await response.json().catch(() => ({}))).error;
    } else {
      const res = await window.electronAPI.groups.delete({ id });
      ok = res.success;
      errorMsg = res.error;
    }

    if (ok) {
      showNotification('Groupe supprimé', 'success');
      await fetchGroups();
    } else {
      showNotification('Erreur: ' + (errorMsg || 'Suppression échouée'), 'error');
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
  // Ces vues lisent config.yaml directement (fonctionne sans serveur)
  if (view === 'groups') {
    await fetchGroups();
    return;
  }

  if (view === 'routing') {
    await fetchRouting();
    return;
  }

  if (view === 'config') {
    if (serverRunning) {
      await fetchDevices();
      await fetchConfig();
    }
    return;
  }

  if (!serverRunning) return;

  switch (view) {
    case 'dashboard':
      await fetchStats();
      await fetchUsers();
      await generateQRCode();
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
      const result = await showModal({
        title: 'Nouveau groupe',
        fields: [
          { name: 'name', label: 'Nom du groupe' },
          { name: 'bitrate', label: 'Bitrate (kbps)', type: 'number', default: 96, min: 32, max: 320, step: 1 }
        ],
        confirmLabel: 'Créer'
      });

      if (!result || !result.name.trim()) return;

      const name = result.name.trim();
      const audioBitrate = parseInt(result.bitrate) || 96;

      try {
        let ok, errorMsg;

        if (serverRunning) {
          const response = await fetch(`${API_BASE}/admin/groups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, audioBitrate })
          });
          ok = response.ok;
          if (!ok) errorMsg = (await response.json().catch(() => ({}))).error;
        } else {
          const res = await window.electronAPI.groups.create({ name, audioBitrate });
          ok = res.success;
          errorMsg = res.error;
        }

        if (ok) {
          showNotification('Groupe créé', 'success');
          await fetchGroups();
        } else {
          showNotification('Erreur: ' + (errorMsg || 'Création échouée'), 'error');
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

  // Boutons routing
  document.getElementById('btn-save-routing')?.addEventListener('click', saveRouting);
  document.getElementById('btn-reload-routing')?.addEventListener('click', fetchRouting);
  document.getElementById('btn-refresh-channels')?.addEventListener('click', fetchRouting);
  document.getElementById('btn-add-server-audio-user')?.addEventListener('click', addServerAudioUser);

  // Délégation modifier/supprimer participant serveur
  document.getElementById('server-audio-users-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-sau-action]');
    if (!btn) return;
    const action = btn.dataset.sauAction;
    const name = btn.dataset.sauName;
    if (action === 'edit') {
      await editServerAudioUser(name, btn.dataset.sauGroup, parseInt(btn.dataset.sauInput), parseInt(btn.dataset.sauOutput));
    } else if (action === 'delete') {
      await deleteServerAudioUser(name);
    }
  });
});

// ========== Server Audio Users (dans la vue Routing) ==========

function renderServerAudioUsers() {
  const container = document.getElementById('server-audio-users-list');
  if (!container) return;

  const users = routingData?.serverAudioUsers || [];
  const inputs = routingData?.channelNames?.inputs || {};
  const outputs = routingData?.channelNames?.outputs || {};

  const chLabel = (ch, dir) => {
    if (ch === null || ch === undefined) return 'Aucune';
    const name = dir === 'input' ? inputs[ch] : outputs[ch];
    return name ? `Ch ${ch} · ${name}` : `Ch ${ch}`;
  };

  if (users.length === 0) {
    container.innerHTML = '<p class="empty-state" style="margin-top:1rem">Aucun participant serveur configuré</p>';
    return;
  }

  container.innerHTML = `
    <table class="sau-table">
      <thead>
        <tr><th>Nom</th><th>Groupe</th><th>Entrée</th><th>Sortie</th><th></th></tr>
      </thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td class="sau-name">${escapeHtml(u.name)}</td>
            <td><span class="ch-badge ch-badge-group">${escapeHtml(u.group)}</span></td>
            <td><span class="ch-badge">${chLabel(u.input_channel, 'input')}</span></td>
            <td><span class="ch-badge">${chLabel(u.output_channel, 'output')}</span></td>
            <td class="sau-actions">
              <button class="btn btn-small btn-secondary"
                data-sau-action="edit"
                data-sau-name="${escapeHtml(u.name)}"
                data-sau-group="${escapeHtml(u.group)}"
                data-sau-input="${u.input_channel}"
                data-sau-output="${u.output_channel}">Éditer</button>
              <button class="btn btn-small btn-danger"
                data-sau-action="delete"
                data-sau-name="${escapeHtml(u.name)}">✕</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function buildChannelOptions(dir) {
  const channels = dir === 'input'
    ? routingData?.deviceChannels?.inputDevice?.channels || 0
    : routingData?.deviceChannels?.outputDevice?.channels || 0;
  const names = dir === 'input'
    ? routingData?.channelNames?.inputs || {}
    : routingData?.channelNames?.outputs || {};

  if (channels === 0) return null; // fallback to number input

  const opts = Array.from({ length: channels }, (_, i) => ({
    value: String(i),
    label: names[i] ? `Ch ${i}: ${names[i]}` : `Ch ${i}`
  }));

  if (dir === 'output') {
    opts.unshift({ value: '', label: 'Aucune sortie' });
  }

  return opts;
}

async function addServerAudioUser() {
  const groupsData = await window.electronAPI.groups.list();
  const groupOptions = (groupsData.groups || []).map(g => ({ value: slugify(g.name), label: g.name }));
  const defaultGroup = groupOptions[0]?.value || 'default';

  const inOpts = buildChannelOptions('input');
  const outOpts = buildChannelOptions('output');

  const inputField = inOpts
    ? { name: 'input_channel', label: 'Canal d\'entrée', type: 'select', options: inOpts, default: '0' }
    : { name: 'input_channel', label: 'Canal entrée (index)', type: 'number', default: 0, min: 0, max: 63 };
  const outputField = outOpts
    ? { name: 'output_channel', label: 'Canal de sortie', type: 'select', options: outOpts, default: '' }
    : { name: 'output_channel', label: 'Canal sortie (index, vide = aucune)', type: 'number', default: '', min: 0, max: 63 };

  const result = await showModal({
    title: 'Nouveau participant serveur',
    fields: [
      { name: 'name', label: 'Nom (identifiant unique, ex: foh)' },
      { name: 'group', label: 'Groupe', type: 'select', options: groupOptions, default: defaultGroup },
      inputField,
      outputField
    ],
    confirmLabel: 'Ajouter'
  });

  if (!result || !result.name.trim()) return;

  const res = await window.electronAPI.serverAudioUsers.create({
    name: result.name.trim(),
    group: result.group,
    input_channel: parseInt(result.input_channel),
    output_channel: result.output_channel !== '' ? parseInt(result.output_channel) : null
  });

  if (res.success) {
    showNotification('Participant serveur ajouté', 'success');
    await fetchRouting();
  } else {
    showNotification('Erreur: ' + (res.error || 'Création échouée'), 'error');
  }
}

async function editServerAudioUser(name, group, input_channel, output_channel) {
  const groupsData = await window.electronAPI.groups.list();
  const groupOptions = (groupsData.groups || []).map(g => ({ value: slugify(g.name), label: g.name }));

  const inOpts = buildChannelOptions('input');
  const outOpts = buildChannelOptions('output');

  const inputField = inOpts
    ? { name: 'input_channel', label: 'Canal d\'entrée', type: 'select', options: inOpts, default: String(input_channel) }
    : { name: 'input_channel', label: 'Canal entrée (index)', type: 'number', default: input_channel, min: 0, max: 63 };
  const outputDefault = output_channel !== null && output_channel !== undefined ? String(output_channel) : '';
  const outputField = outOpts
    ? { name: 'output_channel', label: 'Canal de sortie', type: 'select', options: outOpts, default: outputDefault }
    : { name: 'output_channel', label: 'Canal sortie (index, vide = aucune)', type: 'number', default: outputDefault, min: 0, max: 63 };

  const result = await showModal({
    title: `Modifier "${name}"`,
    fields: [
      { name: 'group', label: 'Groupe', type: 'select', options: groupOptions, default: group },
      inputField,
      outputField
    ],
    confirmLabel: 'Modifier'
  });

  if (!result) return;

  const res = await window.electronAPI.serverAudioUsers.update({
    name,
    group: result.group,
    input_channel: parseInt(result.input_channel),
    output_channel: result.output_channel !== '' ? parseInt(result.output_channel) : null
  });

  if (res.success) {
    showNotification('Participant serveur modifié', 'success');
    await fetchRouting();
  } else {
    showNotification('Erreur: ' + (res.error || 'Modification échouée'), 'error');
  }
}

async function deleteServerAudioUser(name) {
  const confirmed = await showModal({
    title: 'Supprimer le participant serveur',
    message: `Supprimer "${name}" ? Cette action est irréversible.`,
    confirmLabel: 'Supprimer',
    confirmClass: 'btn-danger'
  });

  if (!confirmed) return;

  const res = await window.electronAPI.serverAudioUsers.delete({ name });

  if (res.success) {
    showNotification('Participant serveur supprimé', 'success');
    await fetchRouting();
  } else {
    showNotification('Erreur: ' + (res.error || 'Suppression échouée'), 'error');
  }
}

// ========== Routing ==========

async function fetchRouting() {
  const [routingResult, devResult] = await Promise.all([
    window.electronAPI.routing.get(),
    window.electronAPI.devices.getChannels()
  ]);

  if (routingResult.error) {
    showNotification('Erreur chargement routing: ' + routingResult.error, 'error');
    return;
  }

  deviceChannels = devResult;
  routingData = { ...routingResult, deviceChannels: devResult };
  renderRoutingView();
}

function renderRoutingView() {
  if (!routingData) return;
  renderDeviceBanner();
  renderChannelLabels();
  renderServerAudioUsers();
}

function renderDeviceBanner() {
  const el = document.getElementById('routing-device-info');
  if (!el) return;

  const dc = routingData.deviceChannels;
  if (!dc || dc.error || (dc.inputDevice?.channels === 0 && dc.outputDevice?.channels === 0)) {
    el.innerHTML = `<span class="device-unset">Aucun device configuré — sélectionnez une carte son dans <strong>Configuration</strong></span>`;
    return;
  }

  const { inputDevice, outputDevice } = dc;
  el.innerHTML = `
    <span class="device-entry"><strong>Entrée :</strong> ${escapeHtml(inputDevice.name)}
      <span class="device-ch-badge">${inputDevice.channels} ch</span></span>
    <span class="device-sep">·</span>
    <span class="device-entry"><strong>Sortie :</strong> ${escapeHtml(outputDevice.name)}
      <span class="device-ch-badge">${outputDevice.channels} ch</span></span>`;
}

function renderChannelLabels() {
  const { channelNames, deviceChannels: dc } = routingData;
  const inputs = channelNames?.inputs || {};
  const outputs = channelNames?.outputs || {};
  const inputCount = dc?.inputDevice?.channels || 0;
  const outputCount = dc?.outputDevice?.channels || 0;

  const inputsEl = document.getElementById('channel-names-inputs');
  const outputsEl = document.getElementById('channel-names-outputs');

  if (inputsEl) {
    inputsEl.innerHTML = inputCount > 0
      ? Array.from({ length: inputCount }, (_, i) => channelLabelRow('input', i, inputs[i] || '')).join('')
      : '<p class="config-note">Aucun device d\'entrée détecté.</p>';
  }

  if (outputsEl) {
    outputsEl.innerHTML = outputCount > 0
      ? Array.from({ length: outputCount }, (_, i) => channelLabelRow('output', i, outputs[i] || '')).join('')
      : '<p class="config-note">Aucun device de sortie détecté.</p>';
  }
}

function channelLabelRow(dir, ch, name) {
  return `
    <div class="channel-name-row" data-channel="${ch}" data-dir="${dir}">
      <span class="channel-index">Ch ${ch}</span>
      <input type="text" class="form-control form-control-small channel-name-input"
             data-dir="${dir}" data-channel="${ch}"
             value="${escapeHtml(name)}" placeholder="Label canal ${ch}">
    </div>`;
}

async function saveRouting() {
  if (!routingData) return;

  const newChannelNames = { inputs: {}, outputs: {} };
  document.querySelectorAll('.channel-name-input[data-dir="input"]').forEach(el => {
    newChannelNames.inputs[el.dataset.channel] = el.value;
  });
  document.querySelectorAll('.channel-name-input[data-dir="output"]').forEach(el => {
    newChannelNames.outputs[el.dataset.channel] = el.value;
  });

  const result = await window.electronAPI.routing.save({ channelNames: newChannelNames });

  if (result.success) {
    routingData.channelNames = newChannelNames;
    renderRoutingView();
    showNotification('Noms de canaux sauvegardés', 'success');
  } else {
    showNotification('Erreur: ' + (result.error || 'Sauvegarde échouée'), 'error');
  }
}

// ========== Helpers ==========

/**
 * Modal générique (remplace prompt/confirm, non supportés dans Electron).
 * - fields[] → formulaire ; message → confirmation simple
 * Retourne : objet {champ: valeur} | true (confirm) | null (annulé)
 */
function showModal({ title, fields = [], confirmLabel = 'Confirmer', confirmClass = 'btn-primary', message = null }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    const cancelBtn = document.getElementById('modal-cancel');
    const confirmBtn = document.getElementById('modal-confirm');

    titleEl.textContent = title;
    confirmBtn.textContent = confirmLabel;
    confirmBtn.className = `btn ${confirmClass}`;

    if (message) {
      bodyEl.innerHTML = `<p class="modal-message">${escapeHtml(message)}</p>`;
    } else {
      bodyEl.innerHTML = fields.map(field => {
        if (field.type === 'select') {
          const optionsHtml = (field.options || []).map(opt =>
            `<option value="${escapeHtml(opt.value)}" ${opt.value === field.default ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`
          ).join('');
          return `
            <div class="form-group">
              <label>${escapeHtml(field.label)}</label>
              <select id="modal-field-${field.name}" class="form-control">${optionsHtml}</select>
            </div>`;
        }
        return `
          <div class="form-group">
            <label>${escapeHtml(field.label)}</label>
            <input
              type="${field.type || 'text'}"
              id="modal-field-${field.name}"
              class="form-control"
              value="${escapeHtml(String(field.default ?? ''))}"
              ${field.min !== undefined ? `min="${field.min}"` : ''}
              ${field.max !== undefined ? `max="${field.max}"` : ''}
              ${field.step !== undefined ? `step="${field.step}"` : ''}>
          </div>`;
      }).join('');
    }

    overlay.classList.remove('hidden');

    const firstInput = bodyEl.querySelector('input');
    if (firstInput) { firstInput.focus(); firstInput.select(); }

    function cleanup() {
      overlay.classList.add('hidden');
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
    }

    function onCancel() { cleanup(); resolve(null); }

    function onConfirm() {
      if (message) {
        cleanup(); resolve(true);
      } else {
        const result = {};
        fields.forEach(f => {
          const input = document.getElementById(`modal-field-${f.name}`);
          result[f.name] = input ? input.value : '';
        });
        cleanup(); resolve(result);
      }
    }

    function onOverlayClick(e) { if (e.target === overlay) onCancel(); }
    function onKeydown(e) {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && document.activeElement?.tagName !== 'BUTTON') onConfirm();
    }

    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);
  });
}

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
