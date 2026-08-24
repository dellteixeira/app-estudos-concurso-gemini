'use strict';
const { test, expect } = require('@playwright/test');

test.describe('critical state and sync architecture', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.AppState && window.SyncEngine && window.AppLocalBackupStore, null, { timeout: 10000 });
  });

  test('canonical modules boot together in the real app shell', async ({ page }) => {
    const contracts = await page.evaluate(() => ({
      state: ['getSnapshot','getCurrentContest','getEdital','getTopic','select','getDiagnostics','updateTopic','subscribe','refresh'].every(name => typeof AppState[name] === 'function'),
      sync: ['getState','getPendingCount','getHistory','getDiagnostics','syncNow','markPending','reportConflict','resolveConflict','subscribe'].every(name => typeof SyncEngine[name] === 'function'),
      backup: ['read','write','fingerprint','countStats'].every(name => typeof AppLocalBackupStore[name] === 'function')
    }));
    expect(contracts).toEqual({ state:true, sync:true, backup:true });
  });

  test('AppState subscription emits a canonical snapshot', async ({ page }) => {
    const result = await page.evaluate(() => {
      let snapshot;
      const unsubscribe = AppState.subscribe(value => {
        snapshot = value;
      });
      unsubscribe();
      return {
        schemaVersion:snapshot?.schemaVersion,
        hasContest: typeof snapshot?.currentContest === 'string',
        edital: Array.isArray(snapshot?.edital),
        changedAt:typeof snapshot?.changedAt === 'string'
      };
    });
    expect(result).toEqual({ schemaVersion:2, hasContest:true, edital:true, changedAt:true });
  });

  test('AppState exposes selector and bounded diagnostics contract', async ({ page }) => {
    const result = await page.evaluate(() => ({
      selected:AppState.select(snapshot => ({ contest:snapshot.currentContest, count:snapshot.edital.length })),
      diagnostics:AppState.getDiagnostics()
    }));
    expect(typeof result.selected.contest).toBe('string');
    expect(result.selected.count).toBeGreaterThanOrEqual(0);
    expect(result.diagnostics.schemaVersion).toBe(2);
    expect(result.diagnostics.revision).toBeGreaterThanOrEqual(0);
    expect(result.diagnostics.subscriberCount).toBeGreaterThanOrEqual(0);
    expect(result.diagnostics.editalCount).toBeGreaterThanOrEqual(0);
  });

  test('SyncEngine exposes explicit offline state without losing persistence', async ({ page, context }) => {
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    const offlineState = await page.evaluate(() => SyncEngine.getState());
    expect(['idle','pending']).toContain(offlineState.status);
    expect(offlineState.schemaVersion).toBe(2);
    expect(offlineState).toHaveProperty('pending');
    expect(offlineState).toHaveProperty('updatedAt');
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
  });

  test('SyncEngine records bounded transition diagnostics', async ({ page, context }) => {
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    const result = await page.evaluate(() => ({
      history:SyncEngine.getHistory(40),
      diagnostics:SyncEngine.getDiagnostics()
    }));
    expect(result.history.length).toBeLessThanOrEqual(40);
    expect(result.history.length).toBeGreaterThan(0);
    expect(result.history.at(-1)).toHaveProperty('from');
    expect(result.history.at(-1)).toHaveProperty('to');
    expect(result.history.at(-1)).toHaveProperty('reason');
    expect(result.diagnostics.schemaVersion).toBe(2);
    expect(typeof result.diagnostics.online).toBe('boolean');
    expect(result.diagnostics.transitionCount).toBeLessThanOrEqual(40);
  });

  test('extracted backup module preserves deterministic fingerprint and stats', async ({ page }) => {
    const value = await page.evaluate(() => {
      const core={
        concursosMetadata:{
          'Concurso Geral':{},
          'TJ':{flashcards:[{},{}],studySessions:[{}]}
        },
        editalItems:[{id:1},{id:2},{id:3}]
      };
      const snapshot={core};
      return {
        a:AppLocalBackupStore.fingerprint(core),
        b:AppLocalBackupStore.fingerprint(core),
        stats:AppLocalBackupStore.countStats(snapshot)
      };
    });
    expect(value.a).toBe(value.b);
    expect(value.stats).toEqual({ concursos:1, topicos:3, flashcards:2, sessions:1 });
  });
});
