import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { createUiLocaleUpdateGate } from '../../renderer/settings/ui-locale-update-gate.js';

describe('UI locale settings update gate', () => {
  it('delivers a successful locale save after the Settings surface closes', async () => {
    const gate = createUiLocaleUpdateGate();
    const ticket = gate.begin(true);
    const savedLocales: string[] = [];
    const save = Promise.resolve('en' as const);

    // Closing Settings invalidates local UI ownership, but AppShell remains
    // mounted and still owns the locale callback.
    const surfaceMounted = false;
    await save.then((locale) => {
      assert.equal(surfaceMounted, false);
      assert.equal(gate.commit(ticket, locale, (next) => savedLocales.push(next)), true);
    });

    assert.deepEqual(savedLocales, ['en']);
  });

  it('ignores unrelated settings writes and rejects stale locale responses', () => {
    const gate = createUiLocaleUpdateGate();
    const firstLocaleTicket = gate.begin(true);
    assert.equal(gate.begin(false), null);
    const latestLocaleTicket = gate.begin(true);
    const savedLocales: string[] = [];

    assert.equal(gate.commit(firstLocaleTicket, 'en', (next) => savedLocales.push(next)), false);
    assert.equal(gate.commit(latestLocaleTicket, 'zh', (next) => savedLocales.push(next)), true);
    assert.deepEqual(savedLocales, ['zh']);
  });

  it('delivers the persisted auto preference without resolving it locally', () => {
    const gate = createUiLocaleUpdateGate();
    const savedPreferences: string[] = [];

    assert.equal(
      gate.commit(gate.begin(true), 'auto', (next) => savedPreferences.push(next)),
      true,
    );
    assert.deepEqual(savedPreferences, ['auto']);
  });
});
