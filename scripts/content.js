/**
 * SessionLink Content Script
 * Handles DOM injection and conversation scraping for ChatGPT, Claude, and Gemini.
 *
 * Key fixes in this version:
 *  - Uses chrome.runtime.sendMessage with callback (not Promise) so the
 *    background service-worker always receives the message.
 *  - Updated DOM selectors for ChatGPT (Feb 2026 DOM), Claude, and Gemini.
 *  - Resume injects text AND simulates Enter to auto-send per the spec.
 *  - Robust retry loop for button injection on SPA navigations.
 */

(function () {
  'use strict';

  // ── Platform configs ───────────────────────────────────────────────
  var PLATFORMS = {
    chatgpt: {
      name: 'ChatGPT',
      hostPatterns: ['chatgpt.com', 'chat.openai.com'],
      selectors: {
        // ChatGPT 2025-2026 DOM
        userMessage: '[data-message-author-role="user"]',
        assistantMessage: '[data-message-author-role="assistant"]',
        allMessages: '[data-message-author-role]',
        inputArea: '#prompt-textarea',
        sendButton: '[data-testid="send-button"], button[aria-label="Send prompt"]',
        conversationArea: 'main'
      },
      getMessageText: function (el) {
        var md = el.querySelector('.markdown, .whitespace-pre-wrap, .text-message');
        return md ? md.innerText.trim() : el.innerText.trim();
      }
    },
    claude: {
      name: 'Claude',
      hostPatterns: ['claude.ai'],
      selectors: {
        userMessage: '[data-testid="user-message"], .font-user-message',
        assistantMessage: '[data-testid="ai-message"], .font-claude-message',
        allMessages: '[data-testid="user-message"], [data-testid="ai-message"], .font-user-message, .font-claude-message',
        inputArea: '[contenteditable="true"].ProseMirror, div[contenteditable="true"], fieldset textarea',
        sendButton: 'button[aria-label="Send Message"], button[aria-label="Send message"], fieldset button[type="button"]:last-of-type',
        conversationArea: 'main, [role="main"]'
      },
      getMessageText: function (el) {
        return el.innerText.trim();
      }
    },
    gemini: {
      name: 'Gemini',
      hostPatterns: ['gemini.google.com'],
      selectors: {
        userMessage: '.query-text, user-query, .user-query',
        assistantMessage: '.model-response-text, model-response, .response-content',
        allMessages: '.query-text, .model-response-text, user-query, model-response',
        inputArea: '.ql-editor, rich-textarea .ql-editor, div[contenteditable="true"], textarea[aria-label]',
        sendButton: 'button.send-button, button[aria-label="Send message"], .send-button-container button',
        conversationArea: 'main, .conversation-container'
      },
      getMessageText: function (el) {
        return el.innerText.trim();
      }
    }
  };

  // ── Detect current platform ────────────────────────────────────────
  function detectPlatform() {
    var hostname = window.location.hostname;
    var keys = Object.keys(PLATFORMS);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var cfg = PLATFORMS[key];
      for (var j = 0; j < cfg.hostPatterns.length; j++) {
        if (hostname.indexOf(cfg.hostPatterns[j]) !== -1) {
          return { id: key, name: cfg.name, selectors: cfg.selectors, getMessageText: cfg.getMessageText };
        }
      }
    }
    return null;
  }

  var platform = detectPlatform();
  if (!platform) return;

  // Prevent double-injection (only on supported platforms)
  if (window.__sessionLinkInjected) return;
  window.__sessionLinkInjected = true;

  console.log('SessionLink: detected ' + platform.name);

  // ── Messaging helper (callback-based, works reliably with MV3) ────
  function sendMsg(msg, cb) {
    try {
      chrome.runtime.sendMessage(msg, function (response) {
        if (chrome.runtime.lastError) {
          console.warn('SessionLink sendMsg error:', chrome.runtime.lastError.message);
          if (cb) cb({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        if (cb) cb(response || { success: false, error: 'No response' });
      });
    } catch (e) {
      console.error('SessionLink sendMsg exception:', e);
      if (cb) cb({ success: false, error: e.message });
    }
  }

  // ── Scrape conversation ────────────────────────────────────────────
  function scrapeConversation(maxTurns) {
    maxTurns = maxTurns || 15;
    var messages = [];
    var sel = platform.selectors;

    // Try role-based approach first (ChatGPT)
    var allEls = document.querySelectorAll(sel.allMessages);
    if (allEls.length > 0) {
      for (var i = 0; i < allEls.length; i++) {
        var el = allEls[i];
        var role = el.getAttribute('data-message-author-role');
        if (!role) {
          // Determine role from selector match
          if (el.matches(sel.userMessage)) {
            role = 'user';
          } else {
            role = 'assistant';
          }
        }
        var text = platform.getMessageText(el);
        if (text && text.length > 0) {
          messages.push({ role: role, content: text });
        }
      }
    }

    // Fallback: try user + assistant separately and sort by DOM order
    if (messages.length === 0) {
      var userEls = document.querySelectorAll(sel.userMessage);
      var assistEls = document.querySelectorAll(sel.assistantMessage);
      var combined = [];
      for (var u = 0; u < userEls.length; u++) {
        combined.push({ el: userEls[u], role: 'user' });
      }
      for (var a = 0; a < assistEls.length; a++) {
        combined.push({ el: assistEls[a], role: 'assistant' });
      }
      // Sort by vertical position
      combined.sort(function (x, y) {
        return (x.el.getBoundingClientRect().top + window.scrollY) -
               (y.el.getBoundingClientRect().top + window.scrollY);
      });
      for (var c = 0; c < combined.length; c++) {
        var txt = platform.getMessageText(combined[c].el);
        if (txt && txt.length > 0) {
          messages.push({ role: combined[c].role, content: txt });
        }
      }
    }

    // Keep last N turns
    var limit = maxTurns * 2;
    if (messages.length > limit) {
      messages = messages.slice(messages.length - limit);
    }
    return messages;
  }

  // ── Sanitize text ──────────────────────────────────────────────────
  function sanitize(text) {
    if (!text) return '';
    return text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }

  // ── Inject text into the chat input ────────────────────────────────
  function injectIntoInput(text) {
    var sel = platform.selectors;
    var input = document.querySelector(sel.inputArea);
    if (!input) {
      // Broad fallback
      input = document.querySelector('#prompt-textarea, [contenteditable="true"], textarea');
    }
    if (!input) return false;

    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      // Native setter to bypass React controlled component
      var nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      );
      if (nativeSetter && nativeSetter.set) {
        nativeSetter.set.call(input, text);
      } else {
        input.value = text;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input.getAttribute('contenteditable') === 'true' || input.isContentEditable) {
      // ContentEditable (ChatGPT ProseMirror, Claude, Gemini)
      input.focus();
      input.innerHTML = '<p>' + escapeHtml(text) + '</p>';
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text
      }));
    }

    input.focus();
    return true;
  }

  // ── Simulate send (Enter key + click send button) ──────────────────
  function simulateSend() {
    var sel = platform.selectors;

    // Small delay to let React/framework process the input
    setTimeout(function () {
      // Try clicking the send button first
      var sendBtn = document.querySelector(sel.sendButton);
      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click();
        console.log('SessionLink: clicked send button');
        return;
      }

      // Fallback: press Enter on the input
      var input = document.querySelector(sel.inputArea) ||
                  document.querySelector('#prompt-textarea, [contenteditable="true"], textarea');
      if (input) {
        input.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true
        }));
        console.log('SessionLink: dispatched Enter keydown');
      }
    }, 400);
  }

  // ── Notification toast ─────────────────────────────────────────────
  function showNotification(message, type) {
    type = type || 'info';
    var existing = document.querySelector('.sessionlink-notification');
    if (existing) existing.remove();

    var el = document.createElement('div');
    el.className = 'sessionlink-notification sessionlink-notification-' + type;
    el.textContent = message;
    document.body.appendChild(el);

    setTimeout(function () { el.classList.add('show'); }, 20);
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 300);
    }, 3500);
  }

  // ── Escape HTML ────────────────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── SAVE STATE handler ─────────────────────────────────────────────
  function handleSave() {
    var btn = document.getElementById('sessionlink-save-btn');
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    var origHTML = btn.innerHTML;
    btn.innerHTML =
      '<svg class="sessionlink-spinner" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>' +
      '<span>Saving…</span>';

    var messages = scrapeConversation(15);
    if (messages.length === 0) {
      showNotification('No conversation found to save.', 'error');
      btn.innerHTML = origHTML;
      btn.disabled = false;
      return;
    }

    // Build conversation text
    var parts = [];
    for (var i = 0; i < messages.length; i++) {
      parts.push(messages[i].role.toUpperCase() + ': ' + sanitize(messages[i].content));
    }
    var conversationText = parts.join('\n\n');

    sendMsg({
      action: 'summarize',
      conversation: conversationText,
      platform: platform.name,
      url: window.location.href,
      timestamp: new Date().toISOString()
    }, function (response) {
      btn.innerHTML = origHTML;
      btn.disabled = false;

      if (response && response.success) {
        showNotification('Context saved successfully!', 'success');
      } else {
        var errMsg = (response && response.error) ? response.error : 'Failed to save context';
        showNotification(errMsg, 'error');
      }
    });
  }

  // ── RESUME STATE handler ───────────────────────────────────────────
  function handleResume() {
    var btn = document.getElementById('sessionlink-resume-btn');
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    var origHTML = btn.innerHTML;
    btn.innerHTML =
      '<svg class="sessionlink-spinner" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>' +
      '<span>Loading…</span>';

    sendMsg({ action: 'getLastSave' }, function (response) {
      btn.innerHTML = origHTML;
      btn.disabled = false;

      if (!response || !response.success || !response.data) {
        showNotification('No saved context found. Save a conversation first.', 'error');
        return;
      }

      var prompt = response.data.summary;
      var injected = injectIntoInput(prompt);

      if (injected) {
        showNotification('Context injected! Sending…', 'success');
        simulateSend();
      } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(prompt).then(function () {
          showNotification('Copied to clipboard — paste it manually.', 'info');
        }).catch(function () {
          showNotification('Could not inject or copy. Please paste manually.', 'error');
        });
      }
    });
  }

  // ── Create UI elements ─────────────────────────────────────────────
  function createContainer() {
    var old = document.getElementById('sessionlink-container');
    if (old) old.remove();

    var container = document.createElement('div');
    container.id = 'sessionlink-container';
    container.className = 'sessionlink-floating-container';
    return container;
  }

  function createSaveButton() {
    var btn = document.createElement('button');
    btn.id = 'sessionlink-save-btn';
    btn.className = 'sessionlink-btn sessionlink-save-btn';
    btn.title = 'Save conversation context for later';
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>' +
      '<polyline points="17 21 17 13 7 13 7 21"></polyline>' +
      '<polyline points="7 3 7 8 15 8"></polyline>' +
      '</svg>' +
      '<span>Save State</span>';
    btn.addEventListener('click', handleSave);
    return btn;
  }

  function createResumeButton() {
    var btn = document.createElement('button');
    btn.id = 'sessionlink-resume-btn';
    btn.className = 'sessionlink-btn sessionlink-resume-btn';
    btn.title = 'Resume from last saved context';
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="1 4 1 10 7 10"></polyline>' +
      '<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>' +
      '</svg>' +
      '<span>Resume State</span>';
    btn.addEventListener('click', handleResume);
    return btn;
  }

  // ── Inject buttons into page ───────────────────────────────────────
  function injectButtons() {
    // Don't double-inject
    if (document.getElementById('sessionlink-container')) return;

    var container = createContainer();
    container.appendChild(createSaveButton());
    container.appendChild(createResumeButton());
    document.body.appendChild(container);
    console.log('SessionLink: buttons injected on ' + platform.name);
  }

  // ── Initialise with retry ──────────────────────────────────────────
  function initialize() {
    var attempts = 0;
    var maxAttempts = 20; // 10 seconds

    var timer = setInterval(function () {
      attempts++;
      var area = document.querySelector(platform.selectors.conversationArea);
      if (area || document.readyState === 'complete' || attempts >= maxAttempts) {
        clearInterval(timer);
        injectButtons();
      }
    }, 500);
  }

  // ── Watch for SPA navigation ───────────────────────────────────────
  function watchNavigation() {
    var lastUrl = window.location.href;
    var observer = new MutationObserver(function () {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        console.log('SessionLink: SPA navigation detected');
        setTimeout(function () {
          injectButtons();
        }, 1500);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ── Boot ───────────────────────────────────────────────────────────
  initialize();
  watchNavigation();

})();
