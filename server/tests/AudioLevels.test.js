import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRMS, calculatePeak } from '../websocket/AudioLevelsServer.js';

describe('calculateRMS', () => {
  test('buffer vide → -120 dBFS', () => {
    assert.equal(calculateRMS(new Float32Array(0)), -120);
    assert.equal(calculateRMS(null), -120);
  });

  test('silence (zéros) → -120 dBFS', () => {
    assert.equal(calculateRMS(new Float32Array(1024)), -120);
  });

  test('signal pleine échelle (1.0) → 0 dBFS', () => {
    const buf = new Float32Array(1024).fill(1.0);
    assert.ok(Math.abs(calculateRMS(buf) - 0) < 0.01);
  });

  test('signal à -6 dBFS (amplitude 0.5) → environ -6 dBFS', () => {
    const buf = new Float32Array(1024).fill(0.5);
    const rms = calculateRMS(buf);
    assert.ok(Math.abs(rms - (-6.02)) < 0.1, `rms=${rms}`);
  });

  test('retourne toujours dans [-120, 0]', () => {
    const buf = new Float32Array(512);
    for (let i = 0; i < buf.length; i++) buf[i] = (Math.random() * 2) - 1;
    const rms = calculateRMS(buf);
    assert.ok(rms >= -120 && rms <= 0, `rms=${rms} hors plage`);
  });
});

describe('calculatePeak', () => {
  test('buffer vide → 0', () => {
    assert.equal(calculatePeak(new Float32Array(0)), 0);
    assert.equal(calculatePeak(null), 0);
  });

  test('silence → 0', () => {
    assert.equal(calculatePeak(new Float32Array(1024)), 0);
  });

  test('détecte le pic maximal', () => {
    const buf = new Float32Array([0.1, 0.5, -0.8, 0.3]);
    assert.ok(Math.abs(calculatePeak(buf) - 0.8) < 0.001);
  });

  test('valeur absolue (pic négatif détecté)', () => {
    const buf = new Float32Array([-1.0]);
    assert.equal(calculatePeak(buf), 1.0);
  });

  test('retourne toujours >= 0', () => {
    const buf = new Float32Array(512);
    for (let i = 0; i < buf.length; i++) buf[i] = (Math.random() * 2) - 1;
    assert.ok(calculatePeak(buf) >= 0);
  });
});
