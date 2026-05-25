import './UserList.css';

/**
 * Liste des participants connectés (utilisateurs + canaux virtuels)
 */
export default function UserList({ participants, onToggleMute }) {
  if (participants.length === 0) {
    return (
      <div className="user-list empty">
        <p className="empty-message">Aucun participant ou canal</p>
      </div>
    );
  }

  // Séparer canaux virtuels et utilisateurs
  const virtualChannels = participants.filter(p => p.isVirtual);
  const users = participants.filter(p => !p.isVirtual);

  return (
    <div className="user-list">
      <div className="user-list-header">
        <span className="user-count">
          {virtualChannels.length > 0 && `${virtualChannels.length} canal${virtualChannels.length > 1 ? 'aux' : ''}`}
          {virtualChannels.length > 0 && users.length > 0 && ' • '}
          {users.length > 0 && `${users.length} utilisateur${users.length > 1 ? 's' : ''}`}
        </span>
      </div>

      <div className="user-list-items">
        {/* Canaux virtuels en premier */}
        {virtualChannels.map((participant) => (
          <div
            key={participant.identity}
            className={`user-item virtual-channel ${participant.isSpeaking ? 'speaking' : ''} ${participant.isMuted ? 'muted' : ''}`}
          >
            <div className="user-avatar channel">
              <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                <path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/>
              </svg>
            </div>

            <div className="user-info">
              <span className="user-name">{participant.name}</span>
              <span className="user-status channel-label">Canal audio</span>
            </div>

            <button
              className="mute-button"
              onClick={() => onToggleMute(participant.identity, participant.isVirtual)}
              title={participant.isMuted ? 'Activer' : 'Désactiver'}
            >
              {participant.isMuted ? (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              )}
            </button>
          </div>
        ))}

        {/* Utilisateurs WebRTC */}
        {users.map((participant) => (
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
