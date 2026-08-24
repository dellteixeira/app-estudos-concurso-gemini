'use strict';
const { test, expect } = require('@playwright/test');

test.describe('critical state and sync architecture', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.AppState && window.SyncEngine && window.AppLocalBackupStore, null, { timeout: 10000 });
  });

  test('canonical modules boot together in the real app shell', async ({ page }) => {
    const contracts = await page.evaluate(() => ({
      state: ['getSnapshot','getCurrentContest','getEdital','getTopic','updateTopic','subscribe','refresh'].every(name => typeof AppState[name] === 'function'),
      sync: ['getState','getPendingCount','syncNow','markPending','reportConflict','resolveConflict','subscribe'].every(name => typeof SyncEngine[name] === 'function'),
      backup: ['read','write','fingerprint','countStats'].every(name => typeof AppLocalBackupStore[name] === 'function')
    }));
    expect(contracts).toEqual({ state:true, sync:true, backup:true });
  });

  test('AppState subscription emits a canonical snapshot', async ({ page }) => {
    const result = await page.evaluate(() => new Promise(resolve => {
      const unsubscribe = AppState.subscribe(snapshot => {
        unsubscribe();
        resolve({ hasContest:typeof snapshot.currentContest === 'string', edital:Array.isArray(snapshot.edital) });
      });
    }));
    expect(result).toEqual({ hasContest:true, edital:true });
  });

  test('SyncEngine exposes explicit offline state without losing persistence', async ({ page, context }) => {
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    const offlineState = await page.evaluate(() => SyncEngine.getState());
    expect(['idle','pending']).toContain(offlineState.status);
    expect(offlineState).toHaveProperty('pending');
    expect(offlineState).toHaveProperty('updatedAt');
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
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
