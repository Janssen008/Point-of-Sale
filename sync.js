// =====================================================================
// ApexMoto POS — Cloud Sync Module
// Automatically syncs local MySQL data to Supabase when online
// =====================================================================

const SyncEngine = {
  SYNC_API: 'api/sync.php',
  POLL_INTERVAL: 30000,       // 30 seconds
  STATUS_CHECK_INTERVAL: 15000, // 15 seconds for status
  _pollTimer: null,
  _statusTimer: null,
  _isSyncing: false,
  _lastStatus: null,

  // ─── Initialize the sync engine ─────────────────────────────────
  init() {
    this.updateIndicator('checking');
    this.checkStatus();

    // Auto-sync every 30 seconds
    this._pollTimer = setInterval(() => this.runSync(), this.POLL_INTERVAL);

    // Status check every 15 seconds
    this._statusTimer = setInterval(() => this.checkStatus(), this.STATUS_CHECK_INTERVAL);

    // Listen for online/offline events
    window.addEventListener('online', () => {
      console.log('[Sync] Browser is online — triggering sync');
      this.updateIndicator('pending');
      setTimeout(() => this.runSync(), 2000);
    });

    window.addEventListener('offline', () => {
      console.log('[Sync] Browser is offline');
      this.updateIndicator('offline');
    });

    // Initial sync after a short delay
    setTimeout(() => this.runSync(), 5000);

    console.log('[Sync] Cloud sync engine initialized (30s interval)');
  },

  // ─── Check sync status (pending count, online status) ────────────
  async checkStatus() {
    try {
      const res = await fetch(`${this.SYNC_API}?action=status`, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const status = await res.json();
      this._lastStatus = status;

      if (!status.online) {
        this.updateIndicator('offline');
      } else if (status.pending > 0) {
        this.updateIndicator('pending', status.pending);
      } else {
        this.updateIndicator('synced');
      }

      this.updateStatusDetails(status);
    } catch (err) {
      console.warn('[Sync] Status check failed:', err.message);
      this.updateIndicator('offline');
    }
  },

  // ─── Run incremental sync ───────────────────────────────────────
  async runSync() {
    if (this._isSyncing) return;
    if (!navigator.onLine) {
      this.updateIndicator('offline');
      return;
    }

    this._isSyncing = true;
    this.updateIndicator('syncing');

    try {
      const res = await fetch(`${this.SYNC_API}?action=run`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();

      if (result.success) {
        if (result.synced > 0) {
          console.log(`[Sync] Pushed ${result.synced} changes to cloud`);
          if (typeof app !== 'undefined' && app.showToast) {
            app.showToast(`☁️ Synced ${result.synced} changes to cloud`, 'success');
          }
        }

        if (result.errors > 0) {
          console.warn(`[Sync] ${result.errors} sync errors`, result.errorMessages);
        }

        // Update indicator
        if (result.remaining > 0) {
          this.updateIndicator('pending', result.remaining);
        } else {
          this.updateIndicator('synced');
        }
      } else {
        this.updateIndicator('offline');
      }
    } catch (err) {
      console.warn('[Sync] Sync failed:', err.message);
      this.updateIndicator('offline');
    } finally {
      this._isSyncing = false;
    }
  },

  // ─── Full sync: push ALL local data to cloud ────────────────────
  async runFullSync() {
    if (this._isSyncing) {
      if (typeof app !== 'undefined' && app.showToast) {
        app.showToast('Sync already in progress...', 'warning');
      }
      return;
    }

    this._isSyncing = true;
    this.updateIndicator('syncing');

    if (typeof app !== 'undefined' && app.showToast) {
      app.showToast('☁️ Starting full cloud sync...', 'info');
    }

    try {
      const res = await fetch(`${this.SYNC_API}?action=full_sync`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();

      if (result.success) {
        console.log('[Sync] Full sync complete:', result);
        if (typeof app !== 'undefined' && app.showToast) {
          app.showToast(`☁️ Full sync done! ${result.totalSynced} records pushed to cloud`, 'success');
        }
        this.updateIndicator('synced');
      } else {
        console.error('[Sync] Full sync failed:', result.message);
        if (typeof app !== 'undefined' && app.showToast) {
          app.showToast(`Sync failed: ${result.message}`, 'danger');
        }
        this.updateIndicator('offline');
      }
    } catch (err) {
      console.error('[Sync] Full sync error:', err);
      if (typeof app !== 'undefined' && app.showToast) {
        app.showToast('Full sync failed — check internet connection', 'danger');
      }
      this.updateIndicator('offline');
    } finally {
      this._isSyncing = false;
    }
  },

  // ─── Update the sync status indicator in the sidebar ────────────
  updateIndicator(state, count) {
    const dot = document.getElementById('sync-status-dot');
    const text = document.getElementById('sync-status-text');
    const badge = document.getElementById('sync-pending-badge');

    if (!dot || !text) return;

    // Remove all state classes
    dot.classList.remove('sync-synced', 'sync-pending', 'sync-offline', 'sync-syncing', 'sync-checking');

    switch (state) {
      case 'synced':
        dot.classList.add('sync-synced');
        text.textContent = 'Cloud Synced';
        if (badge) badge.style.display = 'none';
        break;
      case 'pending':
        dot.classList.add('sync-pending');
        text.textContent = count ? `${count} pending` : 'Pending sync';
        if (badge) {
          badge.textContent = count || '!';
          badge.style.display = 'inline-block';
        }
        break;
      case 'syncing':
        dot.classList.add('sync-syncing');
        text.textContent = 'Syncing...';
        if (badge) badge.style.display = 'none';
        break;
      case 'offline':
        dot.classList.add('sync-offline');
        text.textContent = 'Offline';
        if (badge) badge.style.display = 'none';
        break;
      case 'checking':
        dot.classList.add('sync-checking');
        text.textContent = 'Checking...';
        if (badge) badge.style.display = 'none';
        break;
    }
  },

  // ─── Update expanded status details panel ───────────────────────
  updateStatusDetails(status) {
    const panel = document.getElementById('sync-details-panel');
    if (!panel) return;

    const lastSync = status.lastSync
      ? new Date(status.lastSync).toLocaleTimeString()
      : 'Never';

    panel.innerHTML = `
      <div class="sync-detail-row">
        <span>Status</span>
        <span>${status.online ? '🟢 Online' : '🔴 Offline'}</span>
      </div>
      <div class="sync-detail-row">
        <span>Pending</span>
        <span>${status.pending} items</span>
      </div>
      ${status.failed > 0 ? `
      <div class="sync-detail-row sync-detail-error">
        <span>Failed</span>
        <span>${status.failed} items</span>
      </div>
      ` : ''}
      <div class="sync-detail-row">
        <span>Last Sync</span>
        <span>${lastSync}</span>
      </div>
    `;
  },

  // ─── Cleanup on page unload ─────────────────────────────────────
  destroy() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    if (this._statusTimer) clearInterval(this._statusTimer);
  }
};

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Delay init to let the main app load first
  setTimeout(() => SyncEngine.init(), 1500);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => SyncEngine.destroy());
