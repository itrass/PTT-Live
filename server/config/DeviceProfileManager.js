/**
 * DeviceProfileManager.js
 * Gestion des profils de cartes son (noms de canaux, channel count)
 *
 * Stocké dans device-profiles.yaml, séparé de config.yaml.
 * Les profils sont indexés par device ID (nom de la carte).
 * Entrée et sortie ont chacun leur profil indépendant.
 *
 * Structure de device-profiles.yaml :
 *   inputs:
 *     "BlackHole 2ch":
 *       channels: 2
 *       names:
 *         "0": Mic
 *         "1": Retour scène
 *   outputs:
 *     "Haut-parleurs MacBook Pro":
 *       channels: 2
 *       names:
 *         "0": Mac L
 *         "1": Mac R
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROFILES_PATH = join(__dirname, 'device-profiles.yaml');

export class DeviceProfileManager {
  constructor(profilesPath = DEFAULT_PROFILES_PATH) {
    this.profilesPath = profilesPath;
    this.profiles = this._load();
  }

  _load() {
    if (!existsSync(this.profilesPath)) {
      return { inputs: {}, outputs: {} };
    }
    try {
      const content = readFileSync(this.profilesPath, 'utf8');
      return YAML.parse(content) || { inputs: {}, outputs: {} };
    } catch (error) {
      console.error('Erreur chargement device-profiles.yaml:', error.message);
      return { inputs: {}, outputs: {} };
    }
  }

  _save() {
    writeFileSync(this.profilesPath, YAML.stringify(this.profiles), 'utf8');
  }

  getInputProfile(deviceId) {
    if (!deviceId) return null;
    return this.profiles.inputs?.[deviceId] || null;
  }

  getOutputProfile(deviceId) {
    if (!deviceId) return null;
    return this.profiles.outputs?.[deviceId] || null;
  }

  /**
   * Retourne les channelNames fusionnés pour une paire input/output.
   * C'est le format attendu par AudioLevelsServer et la vue Routing.
   */
  getChannelNames(inputDeviceId, outputDeviceId) {
    const inputProfile = this.getInputProfile(inputDeviceId);
    const outputProfile = this.getOutputProfile(outputDeviceId);
    return {
      inputs: inputProfile?.names || {},
      outputs: outputProfile?.names || {}
    };
  }

  /**
   * Sauvegarde le profil d'un device d'entrée.
   * Ne touche pas aux noms existants si names n'est pas fourni.
   */
  saveInputProfile(deviceId, { channels, names }) {
    if (!deviceId) return;
    if (!this.profiles.inputs) this.profiles.inputs = {};

    const existing = this.profiles.inputs[deviceId] || {};
    this.profiles.inputs[deviceId] = {
      ...existing,
      ...(channels !== undefined ? { channels } : {}),
      ...(names !== undefined ? { names } : {})
    };
    this._save();
    console.log(`💾 Profil entrée sauvegardé : "${deviceId}"`);
  }

  /**
   * Sauvegarde le profil d'un device de sortie.
   */
  saveOutputProfile(deviceId, { channels, names }) {
    if (!deviceId) return;
    if (!this.profiles.outputs) this.profiles.outputs = {};

    const existing = this.profiles.outputs[deviceId] || {};
    this.profiles.outputs[deviceId] = {
      ...existing,
      ...(channels !== undefined ? { channels } : {}),
      ...(names !== undefined ? { names } : {})
    };
    this._save();
    console.log(`💾 Profil sortie sauvegardé : "${deviceId}"`);
  }

  /**
   * Sauvegarde channelNames pour la paire input/output active.
   * Appelé depuis routing:save (IPC) ou PUT /admin/audio/channels/names.
   */
  saveChannelNames(inputDeviceId, outputDeviceId, { inputs, outputs }) {
    if (inputDeviceId && inputs !== undefined) {
      this.saveInputProfile(inputDeviceId, { names: inputs });
    }
    if (outputDeviceId && outputs !== undefined) {
      this.saveOutputProfile(outputDeviceId, { names: outputs });
    }
  }

  /**
   * Enregistre le channel count réel d'un device (appelé à l'init du bridge).
   * Ne modifie pas les noms existants.
   */
  recordDeviceChannels(inputDeviceId, inputChannels, outputDeviceId, outputChannels) {
    if (inputDeviceId && inputChannels) {
      this.saveInputProfile(inputDeviceId, { channels: inputChannels });
    }
    if (outputDeviceId && outputChannels) {
      this.saveOutputProfile(outputDeviceId, { channels: outputChannels });
    }
  }

  listProfiles() {
    return this.profiles;
  }
}

const deviceProfileManager = new DeviceProfileManager();
export default deviceProfileManager;
