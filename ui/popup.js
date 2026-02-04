/**
 * SessionLink Popup Script
 * Handles settings management and saved states display
 */

(function() {
  'use strict';

  // Browser API compatibility
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  // DOM Elements
  const elements = {
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

  // Initialize popup
  async function init() {
    setupTabNavigation();
    setupSettingsForm();
    await loadSettings();
    await loadSaves();
  }

  // Tab navigation
  function setupTabNavigation() {
    elements.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        
        // Update button states
        elements.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(tab => {
          tab.classList.remove('active');
        });
        document.getElementById(`${tabId}-tab`).classList.add('active');
        
        // Refresh saves when switching to saves tab
        if (tabId === 'saves') {
          loadSaves();
        }
      });
    });
  }

  // Settings form setup
  function setupSettingsForm() {
    // Toggle API key visibility
    elements.toggleKey.addEventListener('click', () => {
      const input = elements.apiKey;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      
      // Update icon
      const eyeIcon = document.getElementById('eye-icon');
      if (isPassword) {
        eyeIcon.innerHTML = `
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
      } else {
        eyeIcon.innerHTML = `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        `;
      }
    });

    // Save settings
    elements.saveSettingsBtn.addEventListener('click', saveSettings);
  }

  // Load settings from storage
  async function loadSettings() {
    try {
      const response = await sendMessage({ action: 'getSettings' });
      
      if (response.success && response.data) {
        elements.apiProvider.value = response.data.apiProvider || 'openai';
        elements.apiKey.value = response.data.apiKey || '';
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  // Save settings to storage
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

    // Basic API key format validation
    if (settings.apiProvider === 'openai' && !settings.apiKey.startsWith('sk-')) {
      showStatus('OpenAI API keys should start with "sk-"', 'error');
      return;
    }

    try {
      elements.saveSettingsBtn.disabled = true;
      elements.saveSettingsBtn.innerHTML = `
        <svg class="spinner" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
        Saving...
      `;

      const response = await sendMessage({ action: 'saveSettings', settings });
      
      if (response.success) {
        showStatus('Settings saved successfully!', 'success');
      } else {
        showStatus(response.error || 'Failed to save settings', 'error');
      }
    } catch (error) {
      showStatus('Error: ' + error.message, 'error');
    } finally {
      elements.saveSettingsBtn.disabled = false;
      elements.saveSettingsBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Save Settings
      `;
    }
  }

  // Show status message
  function showStatus(message, type) {
    elements.settingsStatus.textContent = message;
    elements.settingsStatus.className = `status-message ${type}`;
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      elements.settingsStatus.classList.add('hidden');
    }, 3000);
  }

  // Load saved states
  async function loadSaves() {
    try {
      const response = await sendMessage({ action: 'getAllSaves' });
      
      if (response.success && response.data && response.data.length > 0) {
        renderSaves(response.data);
      } else {
        renderEmptyState();
      }
    } catch (error) {
      console.error('Failed to load saves:', error);
      renderEmptyState();
    }
  }

  // Render saves list
  function renderSaves(saves) {
    elements.savesList.innerHTML = saves.map(save => `
      <div class="save-item" data-id="${save.id}">
        <div class="save-item-header">
          <span class="save-item-platform">${save.platform || 'Unknown'}</span>
          <span class="save-item-time">${formatTime(save.timestamp)}</span>
        </div>
        <div class="save-item-preview">${escapeHtml(save.preview || save.summary.substring(0, 100) + '...')}</div>
        <div class="save-item-actions">
          <button class="btn btn-secondary btn-sm copy-btn" data-id="${save.id}" title="Copy to clipboard">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy
          </button>
          <button class="btn btn-danger btn-sm delete-btn" data-id="${save.id}" title="Delete">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Delete
          </button>
        </div>
      </div>
    `).join('');

    // Add event listeners
    elements.savesList.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => copySave(btn.dataset.id, saves));
    });

    elements.savesList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteSave(btn.dataset.id));
    });
  }

  // Render empty state
  function renderEmptyState() {
    elements.savesList.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="12" y1="18" x2="12" y2="12"></line>
          <line x1="9" y1="15" x2="15" y2="15"></line>
        </svg>
        <p>No saved states yet</p>
        <span>Click "Save State" on any AI chat to create your first save.</span>
      </div>
    `;
  }

  // Copy save to clipboard
  async function copySave(id, saves) {
    const save = saves.find(s => s.id === id);
    if (!save) return;

    try {
      await navigator.clipboard.writeText(save.summary);
      
      // Show feedback
      const btn = elements.savesList.querySelector(`.copy-btn[data-id="${id}"]`);
      const originalHTML = btn.innerHTML;
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Copied!
      `;
      
      setTimeout(() => {
        btn.innerHTML = originalHTML;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }

  // Delete save
  async function deleteSave(id) {
    if (!confirm('Are you sure you want to delete this saved state?')) {
      return;
    }

    try {
      const response = await sendMessage({ action: 'deleteSave', id });
      
      if (response.success) {
        // Remove from DOM
        const item = elements.savesList.querySelector(`.save-item[data-id="${id}"]`);
        if (item) {
          item.remove();
        }
        
        // Check if list is empty
        if (elements.savesList.querySelectorAll('.save-item').length === 0) {
          renderEmptyState();
        }
      }
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  }

  // Send message to background script
  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      browserAPI.runtime.sendMessage(message, (response) => {
        if (browserAPI.runtime.lastError) {
          reject(new Error(browserAPI.runtime.lastError.message));
        } else {
          resolve(response || { success: false });
        }
      });
    });
  }

  // Format timestamp
  function formatTime(timestamp) {
    if (!timestamp) return 'Unknown';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    // Less than 1 minute
    if (diff < 60000) {
      return 'Just now';
    }
    
    // Less than 1 hour
    if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins} min${mins > 1 ? 's' : ''} ago`;
    }
    
    // Less than 24 hours
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    
    // Format as date
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', init);

})();
