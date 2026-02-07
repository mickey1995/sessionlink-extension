/**
 * SessionLink Popup Script
 * Handles settings management and saved states display
 * 
 * Uses chrome.storage.local directly (no message passing needed for storage)
 * This avoids the callback/promise mismatch that breaks settings persistence.
 */

(function () {
  'use strict';

  // ── Storage helpers (direct chrome.storage.local) ──────────────────
  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  function storageSet(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  // ── DOM Elements ───────────────────────────────────────────────────
  let elements = {};

  function cacheElements() {
    elements = {
      // Tabs
      tabBtns: document.querySelectorAll('.tab-btn'),
      settingsTab: document.getElementById('settings-tab'),
      savesTab: document.getElementById('saves-tab'),

      // Settings
      apiProvider: document.getElementById('api-provider'),
      apiKey: document.getElementById('api-key'),
      toggleKey: document.getElementById('toggle-key'),
      saveSettingsBtn: document.getElementById('save-settings'),
      settingsStatus: document.getElementById('settings-status'),

      // Saves
      savesList: document.getElementById('saves-list')
    };
  }

  // ── Initialise ─────────────────────────────────────────────────────
  async function init() {
    cacheElements();
    setupTabNavigation();
    setupSettingsForm();
    await loadSettings();
    await loadSaves();
  }

  // ── Tab navigation ─────────────────────────────────────────────────
  function setupTabNavigation() {
    elements.tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;

        elements.tabBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.tab-content').forEach((tab) => {
          tab.classList.remove('active');
        });
        document.getElementById(tabId + '-tab').classList.add('active');

        if (tabId === 'saves') {
          loadSaves();
        }
      });
    });
  }

  // ── Settings form ──────────────────────────────────────────────────
  function setupSettingsForm() {
    // Toggle API key visibility
    elements.toggleKey.addEventListener('click', () => {
      const input = elements.apiKey;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      const eyeIcon = document.getElementById('eye-icon');
      if (isPassword) {
        eyeIcon.innerHTML =
          '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>' +
          '<line x1="1" y1="1" x2="23" y2="23"></line>';
      } else {
        eyeIcon.innerHTML =
          '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>' +
          '<circle cx="12" cy="12" r="3"></circle>';
      }
    });

    // Save settings button
    elements.saveSettingsBtn.addEventListener('click', saveSettings);
  }

  // ── Load settings from chrome.storage.local ────────────────────────
  async function loadSettings() {
    try {
      const result = await storageGet(['settings']);
      const settings = result.settings || {};
      elements.apiProvider.value = settings.apiProvider || 'openai';
      elements.apiKey.value = settings.apiKey || '';
      console.log('SessionLink popup: settings loaded', settings.apiProvider);
    } catch (err) {
      console.error('SessionLink popup: failed to load settings', err);
    }
  }

  // ── Save settings to chrome.storage.local ──────────────────────────
  async function saveSettings() {
    const settings = {
      apiProvider: elements.apiProvider.value,
      apiKey: elements.apiKey.value.trim()
    };

    // Validate
    if (!settings.apiKey) {
      showStatus('Please enter an API key', 'error');
      return;
    }

    if (settings.apiProvider === 'openai' && !settings.apiKey.startsWith('sk-')) {
      showStatus('OpenAI API keys typically start with "sk-"', 'error');
      return;
    }

    try {
      elements.saveSettingsBtn.disabled = true;
      elements.saveSettingsBtn.textContent = 'Saving…';

      await storageSet({ settings: settings });

      showStatus('Settings saved successfully!', 'success');
      console.log('SessionLink popup: settings saved');
    } catch (err) {
      showStatus('Error: ' + err.message, 'error');
      console.error('SessionLink popup: failed to save settings', err);
    } finally {
      elements.saveSettingsBtn.disabled = false;
      elements.saveSettingsBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Save Settings';
    }
  }

  // ── Status message ─────────────────────────────────────────────────
  function showStatus(message, type) {
    elements.settingsStatus.textContent = message;
    elements.settingsStatus.className = 'status-message ' + type;

    setTimeout(() => {
      elements.settingsStatus.className = 'status-message hidden';
    }, 4000);
  }

  // ── Load saved states from chrome.storage.local ────────────────────
  async function loadSaves() {
    try {
      const result = await storageGet(['saves']);
      const saves = result.saves || [];
      if (saves.length > 0) {
        renderSaves(saves);
      } else {
        renderEmptyState();
      }
    } catch (err) {
      console.error('SessionLink popup: failed to load saves', err);
      renderEmptyState();
    }
  }

  // ── Render saves ───────────────────────────────────────────────────
  function renderSaves(saves) {
    elements.savesList.innerHTML = saves
      .map(
        (save) =>
          '<div class="save-item" data-id="' + save.id + '">' +
          '  <div class="save-item-header">' +
          '    <span class="save-item-platform">' + escapeHtml(save.platform || 'Unknown') + '</span>' +
          '    <span class="save-item-time">' + formatTime(save.timestamp) + '</span>' +
          '  </div>' +
          '  <div class="save-item-preview">' + escapeHtml(save.preview || (save.summary || '').substring(0, 120)) + '</div>' +
          '  <div class="save-item-actions">' +
          '    <button class="btn btn-secondary btn-sm copy-btn" data-id="' + save.id + '" title="Copy to clipboard">Copy</button>' +
          '    <button class="btn btn-danger btn-sm delete-btn" data-id="' + save.id + '" title="Delete">Delete</button>' +
          '  </div>' +
          '</div>'
      )
      .join('');

    // Event listeners
    elements.savesList.querySelectorAll('.copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => copySave(btn.dataset.id, saves));
    });
    elements.savesList.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteSave(btn.dataset.id));
    });
  }

  function renderEmptyState() {
    elements.savesList.innerHTML =
      '<div class="empty-state">' +
      '  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">' +
      '    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>' +
      '    <polyline points="14 2 14 8 20 8"></polyline>' +
      '    <line x1="12" y1="18" x2="12" y2="12"></line>' +
      '    <line x1="9" y1="15" x2="15" y2="15"></line>' +
      '  </svg>' +
      '  <p>No saved states yet</p>' +
      '  <span>Click "Save State" on any AI chat to create your first save.</span>' +
      '</div>';
  }

  // ── Copy save to clipboard ─────────────────────────────────────────
  async function copySave(id, saves) {
    var save = null;
    for (var i = 0; i < saves.length; i++) {
      if (saves[i].id === id) { save = saves[i]; break; }
    }
    if (!save) return;

    try {
      await navigator.clipboard.writeText(save.summary);
      var btn = elements.savesList.querySelector('.copy-btn[data-id="' + id + '"]');
      if (btn) {
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = 'Copy'; }, 2000);
      }
    } catch (err) {
      console.error('SessionLink popup: copy failed', err);
    }
  }

  // ── Delete save ────────────────────────────────────────────────────
  async function deleteSave(id) {
    if (!confirm('Delete this saved state?')) return;

    try {
      var result = await storageGet(['saves']);
      var saves = result.saves || [];
      var filtered = [];
      for (var i = 0; i < saves.length; i++) {
        if (saves[i].id !== id) filtered.push(saves[i]);
      }
      await storageSet({ saves: filtered });

      // Re-render
      if (filtered.length > 0) {
        renderSaves(filtered);
      } else {
        renderEmptyState();
      }
    } catch (err) {
      console.error('SessionLink popup: delete failed', err);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────
  function formatTime(timestamp) {
    if (!timestamp) return 'Unknown';
    var date = new Date(timestamp);
    var now = new Date();
    var diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) {
      var mins = Math.floor(diff / 60000);
      return mins + ' min' + (mins > 1 ? 's' : '') + ' ago';
    }
    if (diff < 86400000) {
      var hours = Math.floor(diff / 3600000);
      return hours + ' hour' + (hours > 1 ? 's' : '') + ' ago';
    }
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ── Boot ───────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
