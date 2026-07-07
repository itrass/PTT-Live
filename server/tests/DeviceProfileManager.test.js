import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DeviceProfileManager } from '../config/DeviceProfileManager.js';

let tmpDir;
let profilesPath;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ptt-test-'));
  profilesPath = join(tmpDir, 'device-profiles.yaml');
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeManager() {
  return new DeviceProfileManager(profilesPath);
}

describe('DeviceProfileManager', () => {
  describe('getInputProfile / getOutputProfile', () => {
    test('retourne null pour un device inconnu', () => {
      const m = makeManager();
      assert.equal(m.getInputProfile('Carte Inconnue'), null);
      assert.equal(m.getOutputProfile('Carte Inconnue'), null);
    });

    test('retourne null si deviceId est null ou undefined', () => {
      const m = makeManager();
      assert.equal(m.getInputProfile(null), null);
      assert.equal(m.getInputProfile(undefined), null);
    });
  });

  describe('saveInputProfile / saveOutputProfile', () => {
    test('sauvegarde et recharge un profil entrée', () => {
      const m = makeManager();
      m.saveInputProfile('BlackHole 2ch', { channels: 2, names: { '0': 'Mic', '1': 'Retour' } });

      const m2 = makeManager(); // recharge depuis le fichier
      const p = m2.getInputProfile('BlackHole 2ch');
      assert.equal(p.channels, 2);
      assert.equal(p.names['0'], 'Mic');
      assert.equal(p.names['1'], 'Retour');
    });

    test('sauvegarde et recharge un profil sortie', () => {
      const m = makeManager();
      m.saveOutputProfile('Haut-parleurs', { channels: 2, names: { '0': 'L', '1': 'R' } });

      const m2 = makeManager();
      const p = m2.getOutputProfile('Haut-parleurs');
      assert.equal(p.channels, 2);
      assert.equal(p.names['0'], 'L');
    });

    test('ne modifie pas les noms existants si names non fourni', () => {
      const m = makeManager();
      m.saveInputProfile('Dante', { channels: 64, names: { '0': 'FOH L' } });
      m.saveInputProfile('Dante', { channels: 32 }); // mise à jour channels seul

      const m2 = makeManager();
      const p = m2.getInputProfile('Dante');
      assert.equal(p.channels, 32);
      assert.equal(p.names['0'], 'FOH L'); // noms préservés
    });

    test('ne fait rien si deviceId est falsy', () => {
      const m = makeManager();
      assert.doesNotThrow(() => m.saveInputProfile(null, { channels: 1, names: {} }));
      assert.doesNotThrow(() => m.saveOutputProfile('', { channels: 1, names: {} }));
    });
  });

  describe('getChannelNames', () => {
    test('fusionne les noms entrée et sortie pour une paire de devices', () => {
      const m = makeManager();
      m.saveInputProfile('IN', { names: { '0': 'Mic A' } });
      m.saveOutputProfile('OUT', { names: { '0': 'Enceinte' } });

      const names = m.getChannelNames('IN', 'OUT');
      assert.equal(names.inputs['0'], 'Mic A');
      assert.equal(names.outputs['0'], 'Enceinte');
    });

    test('retourne des objets vides pour devices inconnus', () => {
      const m = makeManager();
      const names = m.getChannelNames('Inconnu A', 'Inconnu B');
      assert.deepEqual(names.inputs, {});
      assert.deepEqual(names.outputs, {});
    });

    test('fonctionne si un seul device est null', () => {
      const m = makeManager();
      m.saveInputProfile('IN2', { names: { '0': 'Test' } });
      const names = m.getChannelNames('IN2', null);
      assert.equal(names.inputs['0'], 'Test');
      assert.deepEqual(names.outputs, {});
    });
  });

  describe('saveChannelNames', () => {
    test('sauvegarde simultanément entrée et sortie', () => {
      const m = makeManager();
      m.saveChannelNames('DEV-IN', 'DEV-OUT', {
        inputs:  { '0': 'Canal 0' },
        outputs: { '0': 'Sortie 0' }
      });

      const m2 = makeManager();
      assert.equal(m2.getInputProfile('DEV-IN').names['0'], 'Canal 0');
      assert.equal(m2.getOutputProfile('DEV-OUT').names['0'], 'Sortie 0');
    });
  });

  describe('recordDeviceChannels', () => {
    test('enregistre le channel count sans écraser les noms', () => {
      const m = makeManager();
      m.saveInputProfile('MIC', { channels: 1, names: { '0': 'Micro' } });
      m.recordDeviceChannels('MIC', 2, null, null); // mise à jour channels seul

      const m2 = makeManager();
      const p = m2.getInputProfile('MIC');
      assert.equal(p.channels, 2);
      assert.equal(p.names['0'], 'Micro'); // noms préservés
    });
  });
});
