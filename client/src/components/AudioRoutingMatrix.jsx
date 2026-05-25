import React, { useState, useEffect } from 'react';
import './AudioRoutingMatrix.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function AudioRoutingMatrix({ groups, channelNames }) {
  const [routing, setRouting] = useState({ inputToGroup: {}, groupToOutput: {}, gains: {} });
  const [loading, setLoading] = useState(true);
  const [showOnlyNamedChannels, setShowOnlyNamedChannels] = useState(false);

  useEffect(() => {
    loadRouting();
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

  const getChannelName = (type, id) => {
    const name = channelNames?.[type]?.[id];
    return name || `${type === 'inputs' ? 'Input' : 'Output'} ${id}`;
  };

  const hasCustomName = (type, id) => {
    return channelNames?.[type]?.[id] !== undefined;
  };

  const getVisibleInputChannels = () => {
    const allInputs = Array.from({length: 8}, (_, i) => i);
    if (showOnlyNamedChannels) {
      return allInputs.filter(i => hasCustomName('inputs', i));
    }
    return allInputs;
  };

  const getVisibleOutputChannels = () => {
    const allOutputs = Array.from({length: 8}, (_, i) => i);
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
        <h3>Matrice de routing audio</h3>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showOnlyNamedChannels}
              onChange={(e) => setShowOnlyNamedChannels(e.target.checked)}
            />
            <span>Afficher uniquement les canaux nommés</span>
          </label>
          <button onClick={saveRouting} className="btn-primary">
            Sauvegarder le routing
          </button>
        </div>
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
                {getChannelName('inputs', i)}
              </div>

              {groups.map(group => (
                <div
                  key={`${i}-${group.id}`}
                  className={`matrix-cell ${isInputRoutedToGroup(String(i), group.id) ? 'active' : ''}`}
                  onClick={() => toggleInputToGroup(String(i), group.id)}
                >
                  {isInputRoutedToGroup(String(i), group.id) && <span className="checkmark">✓</span>}
                </div>
              ))}
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
              {getChannelName('outputs', i)}
            </div>
          ))}

          {groups.map(group => (
            <React.Fragment key={`group-row-${group.id}`}>
              <div className="matrix-label-cell">
                {group.name}
              </div>

              {getVisibleOutputChannels().map(i => (
                <div
                  key={`${group.id}-${i}`}
                  className={`matrix-cell ${isGroupRoutedToOutput(group.id, String(i)) ? 'active' : ''}`}
                  onClick={() => toggleGroupToOutput(group.id, String(i))}
                >
                  {isGroupRoutedToOutput(group.id, String(i)) && <span className="checkmark">✓</span>}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AudioRoutingMatrix;
