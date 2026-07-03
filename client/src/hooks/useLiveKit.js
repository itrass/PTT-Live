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
  const isAudioUnlockedRef = useRef(false);
  const virtualChannelsRef = useRef([]);
  const mutedChannelsRef = useRef(new Set()); // IDs des canaux muted

  // Analyseur audio pour pistes distantes (audio entrant)
  const remoteAudioContextRef = useRef(null);
  const remoteAnalyserRef = useRef(null);
  const remoteAnimationFrameRef = useRef(null);

  /**
   * Connexion à la room LiveKit
   */
  const connect = useCallback(async (url, token, virtualChannels = []) => {
    try {
      // Stocker les canaux virtuels
      virtualChannelsRef.current = virtualChannels;

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
        console.log('  Room name:', room.name);
        console.log('  Participants distants:', room.remoteParticipants.size);
        setIsConnected(true);
      });

      room.on(RoomEvent.Disconnected, () => {
        console.log('✗ Déconnecté de LiveKit');
        setIsConnected(false);
        cleanup();
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('🟢 Participant rejoint:', participant.identity);
        console.log('  Total participants distants:', room.remoteParticipants.size);
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

          // Setup analyseur pour audio entrant
          setupRemoteAudioAnalyser(track);
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

      // Event track local publié
      room.on(RoomEvent.LocalTrackPublished, (publication) => {
        console.log('✓ Track local publié:', publication.kind);
        if (publication.kind === Track.Kind.Audio) {
          const track = publication.track;
          console.log('  Track audio disponible:', track);
          console.log('  isMuted:', track.isMuted);
          localTrackRef.current = track;
          // Mute par défaut (PTT)
          track.mute();
          setupAudioAnalyser(track);
          // Démarrer l'analyse audio
          analyseAudioLevel();
          console.log('✓ Track audio configuré et muted pour PTT');
        }
      });

      // Connexion
      await room.connect(url, token);

      console.log('📞 Connexion établie, activation microphone...');

      // Activer microphone (muted par défaut)
      await room.localParticipant.setMicrophoneEnabled(true);

      console.log('🎤 Microphone activé, attente publication track...');

      // Attendre que le track soit publié (max 3s)
      let retries = 0;
      while (!localTrackRef.current && retries < 30) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }

      if (!localTrackRef.current) {
        console.error('❌ Timeout : track audio non publié après 3s');
        throw new Error('Microphone non disponible. Autorisez l\'accès au micro dans les réglages iOS.');
      }

      console.log('✓ Track audio prêt');

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
   * Changer de groupe (reconnexion à une nouvelle room)
   */
  const switchGroup = useCallback(async (url, token, virtualChannels = []) => {
    console.log('🔄 Changement de groupe...');

    // Déconnexion propre
    cleanup();
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }

    setIsConnected(false);
    setParticipants([]);

    // Reset canaux muted
    mutedChannelsRef.current.clear();

    // Reconnexion avec nouveau token
    await connect(url, token, virtualChannels);
  }, [connect]);

  /**
   * Débloque l'audio sur mobile (iOS/Android)
   * Doit être appelé dans un gestionnaire d'événement utilisateur
   */
  const unlockAudio = useCallback(() => {
    if (isAudioUnlockedRef.current) return;

    try {
      // Créer un contexte audio silencieux pour débloquer l'API
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      gainNode.gain.value = 0; // Silence
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start(0);
      oscillator.stop(0.001);

      isAudioUnlockedRef.current = true;
      console.log('✓ Audio débloqué (mobile)');
    } catch (error) {
      console.warn('Audio unlock échoué:', error);
    }
  }, []);

  /**
   * Commencer à parler (unmute micro)
   */
  const startTalking = useCallback(async () => {
    console.log('🎤 startTalking appelé');
    console.log('  localTrackRef.current:', localTrackRef.current);

    if (!localTrackRef.current) {
      console.warn('⚠️ Pas de track audio local disponible');
      alert('Microphone non disponible. Réessayez.');
      return;
    }

    try {
      // Débloquer audio sur mobile au premier appui
      unlockAudio();

      // Feedback immédiat AVANT unmute
      setIsTalking(true);

      await localTrackRef.current.unmute();
      console.log('🎤 PTT: Talking (unmuted)');

      // Vibration haptique (si supporté)
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    } catch (error) {
      console.error('❌ Erreur unmute:', error);
      setIsTalking(false);
      alert(`Erreur microphone: ${error.message}`);
    }
  }, [unlockAudio]);

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
   * Mise à jour liste participants (inclut canaux virtuels)
   */
  const updateParticipants = useCallback(() => {
    if (!roomRef.current) return;

    const room = roomRef.current;
    const participantsList = [];

    // Canaux virtuels (affichés en premier)
    virtualChannelsRef.current.forEach((channel) => {
      participantsList.push({
        identity: channel.id,
        name: channel.name,
        isLocal: false,
        isVirtual: true,
        isSpeaking: false, // TODO: détection audio depuis bridge
        hasAudio: true,
        isMuted: mutedChannelsRef.current.has(channel.id),
        audioInput: channel.audioInput,
        audioOutput: channel.audioOutput
      });
    });

    // Participants distants (utilisateurs WebRTC + server audio users)
    // Exclure les participants internes de routage (role: 'bridge')
    room.remoteParticipants.forEach((participant) => {
      let role = null;
      try {
        const meta = participant.metadata ? JSON.parse(participant.metadata) : {};
        role = meta.role || null;
      } catch (_) {}

      if (role === 'bridge') return;

      const audioTracks = participant.audioTracks ? Array.from(participant.audioTracks.values()) : [];
      const audioPublication = audioTracks[0];
      const isSpeaking = room.activeSpeakers.some(s => s.identity === participant.identity);

      participantsList.push({
        identity: participant.identity,
        name: participant.name || participant.identity,
        isLocal: false,
        isVirtual: false,
        isSpeaking,
        hasAudio: audioPublication?.isSubscribed || false,
        isMuted: false
      });
    });

    setParticipants(participantsList);
  }, []);

  /**
   * Toggle mute/unmute d'un participant (canal virtuel ou utilisateur)
   */
  const toggleParticipantMute = useCallback((participantId, isVirtual) => {
    if (isVirtual) {
      // Canal virtuel : toggle dans l'état local
      const isMuted = mutedChannelsRef.current.has(participantId);

      if (isMuted) {
        mutedChannelsRef.current.delete(participantId);
        console.log('🔊 Canal virtuel unmuted:', participantId);
      } else {
        mutedChannelsRef.current.add(participantId);
        console.log('🔇 Canal virtuel muted:', participantId);
      }

      // TODO Phase 3: Envoyer commande au bridge audio via DataChannel
      // pour vraiment muter/unmuter le canal physique

      // Mettre à jour l'affichage
      updateParticipants();
    } else {
      // Utilisateur WebRTC : muter localement la lecture audio
      if (!roomRef.current) return;

      const participant = roomRef.current.remoteParticipants.get(participantId);
      if (!participant) return;

      const audioTracks = Array.from(participant.audioTracks.values());
      const audioPublication = audioTracks[0];

      if (audioPublication && audioPublication.audioTrack) {
        const track = audioPublication.audioTrack;
        const newMutedState = !track.isMuted;

        if (newMutedState) {
          track.mute();
          console.log('🔇 Participant muted:', participantId);
        } else {
          track.unmute();
          console.log('🔊 Participant unmuted:', participantId);
        }

        updateParticipants();
      }
    }
  }, [updateParticipants]);

  /**
   * Setup analyseur audio pour VU-mètre (micro local)
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

      console.log('✓ Analyseur audio local configuré');
    } catch (error) {
      console.error('Erreur setup analyser local:', error);
    }
  };

  /**
   * Setup analyseur audio pour pistes distantes (audio entrant)
   */
  const setupRemoteAudioAnalyser = (track) => {
    try {
      const mediaStream = track.mediaStream;
      if (!mediaStream) return;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(mediaStream);

      analyser.fftSize = 256;
      source.connect(analyser);

      remoteAudioContextRef.current = audioContext;
      remoteAnalyserRef.current = analyser;

      console.log('✓ Analyseur audio distant configuré');
    } catch (error) {
      console.error('Erreur setup analyser distant:', error);
    }
  };

  /**
   * Analyser niveau audio (pour VU-mètre)
   * Alterne entre micro local (si talking) et audio entrant (si listening)
   */
  const analyseAudioLevel = useCallback(() => {
    const analyse = () => {
      // Choisir l'analyseur selon l'état
      const analyser = isTalking ? analyserRef.current : remoteAnalyserRef.current;

      if (analyser) {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);

        // Calculer moyenne
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalized = Math.min(100, (average / 255) * 100);

        setAudioLevel(normalized);
      } else {
        setAudioLevel(0);
      }

      animationFrameRef.current = requestAnimationFrame(analyse);
    };

    analyse();
  }, [isTalking]);

  /**
   * Cleanup
   */
  const cleanup = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (remoteAnimationFrameRef.current) {
      cancelAnimationFrame(remoteAnimationFrameRef.current);
      remoteAnimationFrameRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (remoteAudioContextRef.current) {
      remoteAudioContextRef.current.close();
      remoteAudioContextRef.current = null;
    }

    analyserRef.current = null;
    remoteAnalyserRef.current = null;
    localTrackRef.current = null;
  };

  // Redémarrer l'analyse audio quand isTalking change
  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Redémarrer l'analyse si on a au moins un analyseur
    if (analyserRef.current || remoteAnalyserRef.current) {
      analyseAudioLevel();
    }
  }, [isTalking, analyseAudioLevel]);

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
    switchGroup,
    startTalking,
    stopTalking,
    toggleParticipantMute
  };
}
