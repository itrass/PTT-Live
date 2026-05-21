import './UserList.css';

/**
 * Liste des participants connectés
 */
export default function UserList({ participants }) {
  if (participants.length === 0) {
    return (
      <div className="user-list empty">
        <p className="empty-message">Aucun autre participant</p>
      </div>
    );
  }

  return (
    <div className="user-list">
      <div className="user-list-header">
        <span className="user-count">
          {participants.length} participant{participants.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="user-list-items">
        {participants.map((participant) => (
          <div
            key={participant.identity}
            className={`user-item ${participant.isSpeaking ? 'speaking' : ''}`}
          >
            <div className="user-avatar">
              {participant.name.charAt(0).toUpperCase()}
            </div>

            <div className="user-info">
              <span className="user-name">{participant.name}</span>
              {participant.isSpeaking && (
                <span className="user-status">En train de parler</span>
              )}
            </div>

            <div className="user-indicator">
              {participant.isSpeaking ? (
                <div className="speaking-indicator pulse">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  </svg>
                </div>
              ) : (
                <div className="audio-indicator">
                  {participant.hasAudio ? (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                    </svg>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
