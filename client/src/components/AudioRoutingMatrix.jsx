import React, { useState, useEffect } from 'react';
import './AudioRoutingMatrix.css';
import VUMeter from './VUMeter.jsx';
import { useAudioLevels } from '../hooks/useAudioLevels.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function AudioRoutingMatrix({ groups, channelNames }) {
  const { levels, connected: wsConnected } = useAudioLevels();
  const [routing, setRouting] = useState({ inputToGroup: {}, groupToOutput: {}, gains: {} });
  const [loading, setLoading] = useState(true);
  const [showOnlyNamedChannels, setShowOnlyNamedChannels] = useState(false);
  const [audioDevice, setAudioDevice] = useState({ inputChannels: 8, outputChannels: 8 });

  useEffect(() => {
    loadRouting();
    loadAudioDevice();
  }, []);

  const loadRouting = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/audio/routing`);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      setRouting(data.routing || { inputToGroup: {}, groupToOutput: {}, gains: {} });
    } catch (error) {
      console.error('Erreur chargement routing:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAudioDevice = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/audio/device`);
      if (res.ok) {
        const data = await res.json();
        setAudioDevice({
          inputChannels: data.device?.inputChannels || 8,
          outputChannels: data.device?.outputChannels || 8
        });
      }
    } catch (error) {
      console.error('Erreur chargement audio device:', error);
    }
  };

  const saveRouting = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/audio/routing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routing)
      });

      if (res.ok) {
        alert('Configuration de routing sauvegardée!');
      } else {
        const errorText = await res.text();
        console.error('Erreur serveur:', errorText);
        alert(`Erreur: ${res.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('Erreur sauvegarde routing:', error);
      alert('Erreur lors de la sauvegarde');
    }
  };

  const toggleInputToGroup = (inputId, groupId) => {
    setRouting(prev => {
      const inputToGroup = { ...prev.inputToGroup };
      if (!inputToGroup[inputId]) {
        inputToGroup[inputId] = [];
      }

      const groupArray = [...inputToGroup[inputId]];
      const index = groupArray.indexOf(groupId);

      if (index > -1) {
        groupArray.splice(index, 1);
      } else {
        groupArray.push(groupId);
      }

      inputToGroup[inputId] = groupArray;

      return { ...prev, inputToGroup };
    });
  };

  const toggleGroupToOutput = (groupId, outputId) => {
    setRouting(prev => {
      const groupToOutput = { ...prev.groupToOutput };
      if (!groupToOutput[groupId]) {
        groupToOutput[groupId] = [];
      }

      const outputArray = [...groupToOutput[groupId]];
      const index = outputArray.indexOf(outputId);

      if (index > -1) {
        outputArray.splice(index, 1);
      } else {
        outputArray.push(outputId);
      }

      groupToOutput[groupId] = outputArray;

      return { ...prev, groupToOutput };
    });
  };

  const isInputRoutedToGroup = (inputId, groupId) => {
    return routing.inputToGroup[inputId]?.includes(groupId) || false;
  };

  const isGroupRoutedToOutput = (groupId, outputId) => {
    return routing.groupToOutput[groupId]?.includes(outputId) || false;
  };

  const getGainForInputToGroup = (inputId, groupId) => {
    const key = `in_${inputId}_${groupId}`;
    return routing.gains?.[key] || 0.0;
  };

  const getGainForGroupToOutput = (groupId, outputId) => {
    const key = `${groupId}_out_${outputId}`;
    return routing.gains?.[key] || 0.0;
  };

  const setGainForInputToGroup = (inputId, groupId, gainDb) => {
    setRouting(prev => {
      const gains = { ...prev.gains };
      const key = `in_${inputId}_${groupId}`;
      gains[key] = parseFloat(gainDb);
      return { ...prev, gains };
    });
  };

  const setGainForGroupToOutput = (groupId, outputId, gainDb) => {
    setRouting(prev => {
      const gains = { ...prev.gains };
      const key = `${groupId}_out_${outputId}`;
      gains[key] = parseFloat(gainDb);
      return { ...prev, gains };
    });
  };

  const formatGain = (gainDb) => {
    if (gainDb === 0) return '0dB';
    return gainDb > 0 ? `+${gainDb}dB` : `${gainDb}dB`;
  };

  const getChannelName = (type, id) => {
    const name = channelNames?.[type]?.[id];
    return name || `${type === 'inputs' ? 'Input' : 'Output'} ${id}`;
  };

  const hasCustomName = (type, id) => {
    return channelNames?.[type]?.[id] !== undefined;
  };

  const getVisibleInputChannels = () => {
    const allInputs = Array.from({length: audioDevice.inputChannels}, (_, i) => i);
    if (showOnlyNamedChannels) {
      return allInputs.filter(i => hasCustomName('inputs', i));
    }
    return allInputs;
  };

  const getVisibleOutputChannels = () => {
    const allOutputs = Array.from({length: audioDevice.outputChannels}, (_, i) => i);
    if (showOnlyNamedChannels) {
      return allOutputs.filter(i => hasCustomName('outputs', i));
    }
    return allOutputs;
  };

  if (loading) {
    return <div style={{padding: 'var(--spacing-xl)', textAlign: 'center'}}>Chargement...</div>;
  }

  return (
    <div className="routing-matrix-container">
      <div className="routing-matrix-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h3>Matrice de routing audio</h3>
          <span
            className={`ws-status ${wsConnected ? 'connected' : 'disconnected'}`}
            title={wsConnected ? 'Monitoring temps réel actif' : 'Monitoring temps réel déconnecté'}
          >
            {wsConnected ? '● Live' : '○ Offline'}
          </span>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showOnlyNamedChannels}
            onChange={(e) => setShowOnlyNamedChannels(e.target.checked)}
          />
          <span>Afficher uniquement les canaux nommés</span>
        </label>
      </div>

      <div className="routing-section">
        <h4>Inputs vers Groupes</h4>
        <p className="routing-description">
          Sélectionnez quels inputs audio alimentent chaque groupe
        </p>

        <div className="routing-matrix" style={{gridTemplateColumns: `120px repeat(${groups.length}, minmax(60px, 1fr))`}}>
          <div className="matrix-corner"></div>

          {groups.map(group => (
            <div key={group.id} className="matrix-header-cell">
              {group.name}
            </div>
          ))}

          {getVisibleInputChannels().map(i => (
            <React.Fragment key={`input-row-${i}`}>
              <div className="matrix-label-cell">
                <div className="label-content">
                  <span className="label-text">{getChannelName('inputs', i)}</span>
                  {wsConnected && levels.inputs[i] && (
                    <VUMeter level={levels.inputs[i]} size="mini" />
                  )}
                </div>
              </div>

              {groups.map(group => {
                const isRouted = isInputRoutedToGroup(String(i), group.id);
                const gain = getGainForInputToGroup(String(i), group.id);

                return (
                  <div
                    key={`${i}-${group.id}`}
                    className={`matrix-cell ${isRouted ? 'active' : ''}`}
                  >
                    <div
                      className="cell-checkbox"
                      onClick={() => toggleInputToGroup(String(i), group.id)}
                    >
                      {isRouted && <span className="checkmark">✓</span>}
                    </div>
                    {isRouted && (
                      <select
                        className="gain-select"
                        value={gain}
                        onChange={(e) => setGainForInputToGroup(String(i), group.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value="-12">-12dB</option>
                        <option value="-6">-6dB</option>
                        <option value="-3">-3dB</option>
                        <option value="0">0dB</option>
                        <option value="3">+3dB</option>
                        <option value="6">+6dB</option>
                      </select>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="routing-section">
        <h4>Groupes vers Outputs</h4>
        <p className="routing-description">
          Sélectionnez vers quels outputs chaque groupe envoie son audio
        </p>

        <div className="routing-matrix" style={{gridTemplateColumns: `120px repeat(${getVisibleOutputChannels().length}, minmax(60px, 1fr))`}}>
          <div className="matrix-corner"></div>

          {getVisibleOutputChannels().map(i => (
            <div key={`output-header-${i}`} className="matrix-header-cell">
              <div className="header-content">
                <span className="header-text">{getChannelName('outputs', i)}</span>
                {wsConnected && levels.outputs[i] && (
                  <VUMeter level={levels.outputs[i]} size="mini" />
                )}
              </div>
            </div>
          ))}

          {groups.map(group => (
            <React.Fragment key={`group-row-${group.id}`}>
              <div className="matrix-label-cell">
                <div className="label-content">
                  <span className="label-text">{group.name}</span>
                  {wsConnected && levels.groups[group.id] && (
                    <VUMeter level={levels.groups[group.id]} size="mini" />
                  )}
                </div>
              </div>

              {getVisibleOutputChannels().map(i => {
                const isRouted = isGroupRoutedToOutput(group.id, String(i));
                const gain = getGainForGroupToOutput(group.id, String(i));

                return (
                  <div
                    key={`${group.id}-${i}`}
                    className={`matrix-cell ${isRouted ? 'active' : ''}`}
                  >
                    <div
                      className="cell-checkbox"
                      onClick={() => toggleGroupToOutput(group.id, String(i))}
                    >
                      {isRouted && <span className="checkmark">✓</span>}
                    </div>
                    {isRouted && (
                      <select
                        className="gain-select"
                        value={gain}
                        onChange={(e) => setGainForGroupToOutput(group.id, String(i), e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value="-12">-12dB</option>
                        <option value="-6">-6dB</option>
                        <option value="-3">-3dB</option>
                        <option value="0">0dB</option>
                        <option value="3">+3dB</option>
                        <option value="6">+6dB</option>
                      </select>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="routing-actions">
        <button onClick={saveRouting} className="btn-primary">
          Sauvegarder le routing audio
        </button>
      </div>
    </div>
  );
}

export default AudioRoutingMatrix;
