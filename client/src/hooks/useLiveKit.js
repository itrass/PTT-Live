import { useState, useEffect, useRef, useCallback } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';

/**
 * Hook pour gérer la connexion et l'état LiveKit
 */
export default function useLiveKit() {
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [isTalking, setIsTalking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const roomRef = useRef(null);
  const localTrackRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  /**
   * Connexion à la room LiveKit
   */
  const connect = useCallback(async (url, token) => {
    try {
      // Créer room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      roomRef.current = room;

      // Events
      room.on(RoomEvent.Connected, () => {
        console.log('✓ Connecté à LiveKit');
        setIsConnected(true);
      });

      room.on(RoomEvent.Disconnected, () => {
        console.log('✗ Déconnecté de LiveKit');
        setIsConnected(false);
        cleanup();
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('Participant rejoint:', participant.identity);
        updateParticipants();
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        console.log('Participant parti:', participant.identity);
        updateParticipants();
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log('Track reçu:', track.kind, 'de', participant.identity);
        updateParticipants();

        // Auto-play audio
        if (track.kind === Track.Kind.Audio) {
          const audioElement = track.attach();
          document.body.appendChild(audioElement);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        console.log('Track retiré:', track.kind, 'de', participant.identity);
        track.detach().forEach(el => el.remove());
        updateParticipants();
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        updateParticipants();
      });

      // Connexion
      await room.connect(url, token);

      // Activer microphone (muted par défaut)
      await room.localParticipant.setMicrophoneEnabled(true);
      const track = room.localParticipant.audioTracks.values().next().value?.track;

      if (track) {
        localTrackRef.current = track;
        // Mute par défaut (PTT)
        track.mute();
        setupAudioAnalyser(track);
      }

      updateParticipants();

    } catch (error) {
      console.error('Erreur connexion LiveKit:', error);
      throw error;
    }
  }, []);

  /**
   * Déconnexion
   */
  const disconnect = useCallback(() => {
    cleanup();
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    setIsConnected(false);
    setParticipants([]);
  }, []);

  /**
   * Commencer à parler (unmute micro)
   */
  const startTalking = useCallback(async () => {
    if (!localTrackRef.current) return;

    try {
      await localTrackRef.current.unmute();
      setIsTalking(true);
      console.log('🎤 PTT: Talking');

      // Vibration haptique (si supporté)
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    } catch (error) {
      console.error('Erreur unmute:', error);
    }
  }, []);

  /**
   * Arrêter de parler (mute micro)
   */
  const stopTalking = useCallback(async () => {
    if (!localTrackRef.current) return;

    try {
      await localTrackRef.current.mute();
      setIsTalking(false);
      console.log('🎤 PTT: Listening');

      // Vibration haptique (si supporté)
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
    } catch (error) {
      console.error('Erreur mute:', error);
    }
  }, []);

  /**
   * Mise à jour liste participants
   */
  const updateParticipants = () => {
    if (!roomRef.current) return;

    const room = roomRef.current;
    const participantsList = [];

    // Participants distants
    room.remoteParticipants.forEach((participant) => {
      const audioPublication = Array.from(participant.audioTracks.values())[0];
      const isSpeaking = room.activeSpeakers.some(s => s.identity === participant.identity);

      participantsList.push({
        identity: participant.identity,
        name: participant.name || participant.identity,
        isLocal: false,
        isSpeaking,
        hasAudio: audioPublication?.isSubscribed || false
      });
    });

    setParticipants(participantsList);
  };

  /**
   * Setup analyseur audio pour VU-mètre
   */
  const setupAudioAnalyser = (track) => {
    try {
      const mediaStream = track.mediaStream;
      if (!mediaStream) return;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(mediaStream);

      analyser.fftSize = 256;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Démarrer analyse
      analyseAudioLevel();
    } catch (error) {
      console.error('Erreur setup analyser:', error);
    }
  };

  /**
   * Analyser niveau audio (pour VU-mètre)
   */
  const analyseAudioLevel = () => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const analyse = () => {
      analyser.getByteFrequencyData(dataArray);

      // Calculer moyenne
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const normalized = Math.min(100, (average / 255) * 100);

      setAudioLevel(normalized);

      animationFrameRef.current = requestAnimationFrame(analyse);
    };

    analyse();
  };

  /**
   * Cleanup
   */
  const cleanup = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    localTrackRef.current = null;
  };

  // Cleanup au démontage
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    participants,
    isTalking,
    audioLevel,
    connect,
    disconnect,
    startTalking,
    stopTalking
  };
}
