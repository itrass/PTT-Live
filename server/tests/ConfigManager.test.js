import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../config/ConfigManager.js';

describe('slugify', () => {
  test('minuscules', () => {
    assert.equal(slugify('FOH'), 'foh');
  });

  test('espaces → tirets', () => {
    assert.equal(slugify('Main Stage'), 'main-stage');
  });

  test('accents → ASCII', () => {
    assert.equal(slugify('Scène'), 'scene');
    assert.equal(slugify('Régie'), 'regie');
    assert.equal(slugify('Général'), 'general');
  });

  test('caractères spéciaux supprimés', () => {
    assert.equal(slugify('FOH & MON'), 'foh-mon');
    assert.equal(slugify('Group (1)'), 'group-1');
  });

  test('tirets multiples → un seul tiret', () => {
    assert.equal(slugify('A  B'), 'a-b');
    assert.equal(slugify('A--B'), 'a-b');
  });

  test('trim des espaces en bords', () => {
    assert.equal(slugify('  groupe  '), 'groupe');
  });

  test('nombre converti en string', () => {
    assert.equal(slugify(42), '42');
  });
});
