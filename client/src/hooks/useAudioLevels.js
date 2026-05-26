/**
 * useAudioLevels.js
 * Hook React pour recevoir les niveaux audio temps réel via WebSocket
 */

import { useState, useEffect, useRef } from 'react';

const WS_URL = import.meta.env.VITE_WS_AUDIO_LEVELS_URL || 'ws://localhost:3000/audio-levels';

/**
 * Hook pour monitoring des niveaux audio temps réel
 */
export function useAudioLevels() {
  const [levels, setLevels] = useState({
    inputs: {},
    groups: {},
    outputs: {},
    routing: {
      activeInputs: [],
      activeGroups: [],
      activeOutputs: []
    }
  });

  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, []);

  const connect = () => {
    try {
      console.log('Connexion au WebSocket audio-levels...');
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('WebSocket audio-levels connecté');
        setConnected(true);
        reconnectAttemptsRef.current = 0;

        // Ping périodique pour maintenir la connexion
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 10000);

        ws.pingInterval = pingInterval;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          switch (message.type) {
            case 'initial':
            case 'levels':
              setLevels(message.data);
              break;

            case 'pong':
              // Pong reçu, connexion active
              break;

            default:
              console.warn('Message WebSocket inconnu:', message.type);
          }
        } catch (error) {
          console.error('Erreur parsing message WebSocket:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('Erreur WebSocket audio-levels:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket audio-levels déconnecté');
        setConnected(false);

        if (ws.pingInterval) {
          clearInterval(ws.pingInterval);
        }

        // Reconnexion automatique avec backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        console.log(`Reconnexion dans ${delay}ms...`);

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connect();
        }, delay);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Erreur création WebSocket:', error);
      setConnected(false);
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      if (wsRef.current.pingInterval) {
        clearInterval(wsRef.current.pingInterval);
      }

      wsRef.current.close();
      wsRef.current = null;
    }

    setConnected(false);
  };

  const setUpdateRate = (rateMs) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'setUpdateRate',
        rateMs
      }));
    }
  };

  return {
    levels,
    connected,
    setUpdateRate
  };
}

export default useAudioLevels;
