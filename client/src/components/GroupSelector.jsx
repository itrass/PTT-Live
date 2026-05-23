import { useState, useEffect } from 'react';
import './GroupSelector.css';

/**
 * Composant de sélection de groupe
 * Permet de changer de groupe pendant une session active
 *
 * @param {Object} props
 * @param {string} props.currentGroupId - ID du groupe actuel
 * @param {Function} props.onGroupChange - Callback appelé lors du changement de groupe
 * @param {string} props.apiUrl - URL de l'API
 */
function GroupSelector({ currentGroupId, onGroupChange, apiUrl }) {
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isChanging, setIsChanging] = useState(false);
  const [error, setError] = useState(null);

  // Charger la liste des groupes
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const response = await fetch(`${apiUrl}/groups`);
        if (!response.ok) {
          throw new Error('Erreur chargement groupes');
        }
        const data = await response.json();
        setGroups(data.groups || []);
      } catch (err) {
        console.error('Erreur chargement groupes:', err);
        setError('Impossible de charger les groupes');
      } finally {
        setIsLoading(false);
      }
    };

    fetchGroups();
  }, [apiUrl]);

  const handleChange = async (e) => {
    const newGroupId = e.target.value;

    if (newGroupId === currentGroupId) {
      return; // Pas de changement
    }

    setIsChanging(true);
    setError(null);

    try {
      await onGroupChange(newGroupId);
    } catch (err) {
      console.error('Erreur changement groupe:', err);
      setError('Erreur lors du changement de groupe');
      // Réinitialiser la sélection à l'ancien groupe
      e.target.value = currentGroupId;
    } finally {
      setIsChanging(false);
    }
  };

  if (isLoading) {
    return (
      <div className="group-selector">
        <div className="group-selector-loading">
          Chargement...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="group-selector">
        <div className="group-selector-error">
          {error}
        </div>
      </div>
    );
  }

  const currentGroup = groups.find(g => g.id === currentGroupId);

  return (
    <div className="group-selector">
      <label htmlFor="group-select" className="group-selector-label">
        Groupe
      </label>
      <select
        id="group-select"
        className="group-selector-select"
        value={currentGroupId}
        onChange={handleChange}
        disabled={isChanging || groups.length === 0}
      >
        {groups.map(g => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      {currentGroup && (
        <p className="group-selector-description">
          {currentGroup.description}
        </p>
      )}

      {isChanging && (
        <div className="group-selector-changing">
          Changement de groupe...
        </div>
      )}
    </div>
  );
}

export default GroupSelector;
