import { useState, useEffect } from 'react';
import './AudioRoutingMatrix.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function AudioRoutingMatrix({ groups, channelNames }) {
  const [routing, setRouting] = useState({ inputToGroup: {}, groupToOutput: {}, gains: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRouting();
  }, []);

  const loadRouting = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/audio/routing`);
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
        const error = await res.json();
        alert(`Erreur: ${error.error}`);
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

  if (loading) {
    return <div style={{padding: 'var(--spacing-xl)', textAlign: 'center'}}>Chargement...</div>;
  }

  return (
    <div className="routing-matrix-container">
      <div className="routing-matrix-header">
        <h3>Matrice de routing audio</h3>
        <button onClick={saveRouting} className="btn-primary">
          Sauvegarder le routing
        </button>
      </div>

      <div className="routing-section">
        <h4>Inputs vers Groupes</h4>
        <p className="routing-description">
          Sélectionnez quels inputs audio alimentent chaque groupe
        </p>

        <div className="routing-matrix">
          <div className="matrix-corner"></div>

          <div className="matrix-header-row">
            {groups.map(group => (
              <div key={group.id} className="matrix-header-cell">
                {group.name}
              </div>
            ))}
          </div>

          {Array.from({length: 8}, (_, i) => (
            <div key={`input-row-${i}`} className="matrix-row">
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
            </div>
          ))}
        </div>
      </div>

      <div className="routing-section">
        <h4>Groupes vers Outputs</h4>
        <p className="routing-description">
          Sélectionnez vers quels outputs chaque groupe envoie son audio
        </p>

        <div className="routing-matrix">
          <div className="matrix-corner"></div>

          <div className="matrix-header-row">
            {Array.from({length: 8}, (_, i) => (
              <div key={`output-header-${i}`} className="matrix-header-cell">
                {getChannelName('outputs', i)}
              </div>
            ))}
          </div>

          {groups.map(group => (
            <div key={`group-row-${group.id}`} className="matrix-row">
              <div className="matrix-label-cell">
                {group.name}
              </div>

              {Array.from({length: 8}, (_, i) => (
                <div
                  key={`${group.id}-${i}`}
                  className={`matrix-cell ${isGroupRoutedToOutput(group.id, String(i)) ? 'active' : ''}`}
                  onClick={() => toggleGroupToOutput(group.id, String(i))}
                >
                  {isGroupRoutedToOutput(group.id, String(i)) && <span className="checkmark">✓</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AudioRoutingMatrix;
