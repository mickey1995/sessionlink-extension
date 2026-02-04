/**
 * SessionLink Content Script
 * Handles DOM injection and conversation scraping for ChatGPT, Claude, and Gemini
 */

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.sessionLinkInjected) {
    return;
  }
  window.sessionLinkInjected = true;

  // Platform detection and configuration
  const PLATFORMS = {
    chatgpt: {
      name: 'ChatGPT',
      hostPatterns: ['chatgpt.com', 'chat.openai.com'],
      selectors: {
        messageContainer: '[data-message-author-role]',
        userMessage: '[data-message-author-role="user"]',
        assistantMessage: '[data-message-author-role="assistant"]',
        inputArea: '#prompt-textarea',
        sendButton: '[data-testid="send-button"]',
        conversationArea: 'main',
        newChatIndicator: '[data-testid="composer-background"]'
      },
      getMessageText: (el) => {
        const contentDiv = el.querySelector('.markdown, .whitespace-pre-wrap');
        return contentDiv ? contentDiv.innerText.trim() : el.innerText.trim();
      },
      isNewChat: () => {
        const messages = document.querySelectorAll('[data-message-author-role]');
        return messages.length === 0;
      }
    },
    claude: {
      name: 'Claude',
      hostPatterns: ['claude.ai'],
      selectors: {
        messageContainer: '[data-testid="user-message"], [data-testid="ai-message"]',
        userMessage: '[data-testid="user-message"]',
        assistantMessage: '[data-testid="ai-message"]',
        inputArea: '[contenteditable="true"]',
        sendButton: 'button[aria-label="Send message"], button[type="submit"]',
        conversationArea: 'main',
        newChatIndicator: null
      },
      getMessageText: (el) => {
        return el.innerText.trim();
      },
      isNewChat: () => {
        const messages = document.querySelectorAll('[data-testid="user-message"], [data-testid="ai-message"]');
        return messages.length === 0;
      }
    },
    gemini: {
      name: 'Gemini',
      hostPatterns: ['gemini.google.com'],
      selectors: {
        messageContainer: 'message-content, .conversation-turn',
        userMessage: 'user-query, .user-message',
        assistantMessage: 'model-response, .model-response',
        inputArea: '.ql-editor, [contenteditable="true"], textarea',
        sendButton: 'button[aria-label="Send message"], .send-button',
        conversationArea: 'main, .conversation-container',
        newChatIndicator: null
      },
      getMessageText: (el) => {
        return el.innerText.trim();
      },
      isNewChat: () => {
        const url = window.location.href;
        return url.includes('/app') && !url.includes('/c/');
      }
    }
  };

  // Detect current platform
  function detectPlatform() {
    const hostname = window.location.hostname;
    for (const [key, config] of Object.entries(PLATFORMS)) {
      if (config.hostPatterns.some(pattern => hostname.includes(pattern))) {
        return { id: key, ...config };
      }
    }
    return null;
  }

  const currentPlatform = detectPlatform();
  if (!currentPlatform) {
    console.log('SessionLink: Not on a supported platform');
    return;
  }

  console.log(`SessionLink: Detected platform - ${currentPlatform.name}`);

  // Create and inject the floating button container
  function createButtonContainer() {
    const existing = document.getElementById('sessionlink-container');
    if (existing) {
      existing.remove();
    }

    const container = document.createElement('div');
    container.id = 'sessionlink-container';
    container.className = 'sessionlink-floating-container';
    
    return container;
  }

  // Create Save State button
  function createSaveButton() {
    const button = document.createElement('button');
    button.id = 'sessionlink-save-btn';
    button.className = 'sessionlink-btn sessionlink-save-btn';
    button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17 21 17 13 7 13 7 21"></polyline>
        <polyline points="7 3 7 8 15 8"></polyline>
      </svg>
      <span>Save State</span>
    `;
    button.title = 'Save conversation context for later';
    button.addEventListener('click', handleSaveState);
    return button;
  }

  // Create Resume button
  function createResumeButton() {
    const button = document.createElement('button');
    button.id = 'sessionlink-resume-btn';
    button.className = 'sessionlink-btn sessionlink-resume-btn';
    button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="1 4 1 10 7 10"></polyline>
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
      </svg>
      <span>Resume State</span>
    `;
    button.title = 'Resume from last saved context';
    button.addEventListener('click', handleResumeState);
    return button;
  }

  // Scrape conversation messages
  function scrapeConversation(maxTurns = 15) {
    const messages = [];
    const selectors = currentPlatform.selectors;
    
    // Get all message elements
    let userMessages = document.querySelectorAll(selectors.userMessage);
    let assistantMessages = document.querySelectorAll(selectors.assistantMessage);
    
    // Alternative selectors for different page states
    if (userMessages.length === 0 && assistantMessages.length === 0) {
      // Try alternative approach - get all messages and determine role
      const allMessages = document.querySelectorAll(selectors.messageContainer);
      allMessages.forEach((msg, index) => {
        const role = msg.getAttribute('data-message-author-role') || 
                     (msg.matches(selectors.userMessage) ? 'user' : 'assistant');
        const text = currentPlatform.getMessageText(msg);
        if (text) {
          messages.push({ role, content: text });
        }
      });
    } else {
      // Interleave user and assistant messages
      const allElements = [];
      
      userMessages.forEach(el => {
        allElements.push({ el, role: 'user', pos: getElementPosition(el) });
      });
      
      assistantMessages.forEach(el => {
        allElements.push({ el, role: 'assistant', pos: getElementPosition(el) });
      });
      
      // Sort by position in document
      allElements.sort((a, b) => a.pos - b.pos);
      
      allElements.forEach(item => {
        const text = currentPlatform.getMessageText(item.el);
        if (text) {
          messages.push({ role: item.role, content: text });
        }
      });
    }
    
    // Get last N turns (a turn = user + assistant)
    const turns = maxTurns * 2;
    return messages.slice(-turns);
  }

  // Get element position for sorting
  function getElementPosition(el) {
    const rect = el.getBoundingClientRect();
    return rect.top + window.scrollY;
  }

  // Sanitize text to prevent injection
  function sanitizeText(text) {
    if (!text) return '';
    // Remove potentially dangerous content
    return text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }

  // Handle Save State button click
  async function handleSaveState() {
    const saveBtn = document.getElementById('sessionlink-save-btn');
    const originalContent = saveBtn.innerHTML;
    
    try {
      // Show loading state
      saveBtn.innerHTML = `
        <svg class="sessionlink-spinner" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
        <span>Saving...</span>
      `;
      saveBtn.disabled = true;

      // Scrape conversation
      const messages = scrapeConversation(15);
      
      if (messages.length === 0) {
        showNotification('No conversation found to save', 'error');
        return;
      }

      // Sanitize all messages
      const sanitizedMessages = messages.map(msg => ({
        role: msg.role,
        content: sanitizeText(msg.content)
      }));

      // Format conversation for summarization
      const conversationText = sanitizedMessages
        .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join('\n\n');

      // Send to background script for summarization
      const response = await sendMessageToBackground({
        action: 'summarize',
        conversation: conversationText,
        platform: currentPlatform.name,
        url: window.location.href,
        timestamp: new Date().toISOString()
      });

      if (response.success) {
        showNotification('Context saved successfully!', 'success');
      } else {
        showNotification(response.error || 'Failed to save context', 'error');
      }

    } catch (error) {
      console.error('SessionLink: Save error', error);
      showNotification('Error saving context: ' + error.message, 'error');
    } finally {
      saveBtn.innerHTML = originalContent;
      saveBtn.disabled = false;
    }
  }

  // Handle Resume State button click
  async function handleResumeState() {
    const resumeBtn = document.getElementById('sessionlink-resume-btn');
    const originalContent = resumeBtn.innerHTML;
    
    try {
      // Show loading state
      resumeBtn.innerHTML = `
        <svg class="sessionlink-spinner" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
        <span>Loading...</span>
      `;
      resumeBtn.disabled = true;

      // Get last saved state from storage
      const response = await sendMessageToBackground({
        action: 'getLastSave'
      });

      if (!response.success || !response.data) {
        showNotification('No saved context found', 'error');
        return;
      }

      const resumePrompt = response.data.summary;
      
      // Inject into input area
      const injected = await injectPrompt(resumePrompt);
      
      if (injected) {
        showNotification('Context restored! Press Enter to send.', 'success');
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(resumePrompt);
        showNotification('Copied to clipboard - paste manually', 'info');
      }

    } catch (error) {
      console.error('SessionLink: Resume error', error);
      showNotification('Error resuming context: ' + error.message, 'error');
    } finally {
      resumeBtn.innerHTML = originalContent;
      resumeBtn.disabled = false;
    }
  }

  // Inject prompt into the input area
  async function injectPrompt(text) {
    const selectors = currentPlatform.selectors;
    
    // Try to find input area
    let inputArea = document.querySelector(selectors.inputArea);
    
    if (!inputArea) {
      // Try alternative selectors
      inputArea = document.querySelector('textarea, [contenteditable="true"]');
    }
    
    if (!inputArea) {
      return false;
    }

    // Handle different input types
    if (inputArea.tagName === 'TEXTAREA' || inputArea.tagName === 'INPUT') {
      inputArea.value = text;
      inputArea.dispatchEvent(new Event('input', { bubbles: true }));
      inputArea.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (inputArea.contentEditable === 'true') {
      inputArea.innerHTML = '';
      inputArea.textContent = text;
      inputArea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    }

    // Focus the input
    inputArea.focus();
    
    return true;
  }

  // Send message to background script
  function sendMessageToBackground(message) {
    return new Promise((resolve, reject) => {
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      
      browserAPI.runtime.sendMessage(message, (response) => {
        if (browserAPI.runtime.lastError) {
          reject(new Error(browserAPI.runtime.lastError.message));
        } else {
          resolve(response || { success: false, error: 'No response' });
        }
      });
    });
  }

  // Show notification toast
  function showNotification(message, type = 'info') {
    // Remove existing notification
    const existing = document.querySelector('.sessionlink-notification');
    if (existing) {
      existing.remove();
    }

    const notification = document.createElement('div');
    notification.className = `sessionlink-notification sessionlink-notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Initialize and inject buttons
  function initialize() {
    // Wait for page to be ready
    const checkReady = setInterval(() => {
      const conversationArea = document.querySelector(currentPlatform.selectors.conversationArea);
      
      if (conversationArea || document.readyState === 'complete') {
        clearInterval(checkReady);
        injectButtons();
      }
    }, 500);
    
    // Timeout after 10 seconds
    setTimeout(() => clearInterval(checkReady), 10000);
  }

  // Inject buttons into page
  function injectButtons() {
    const container = createButtonContainer();
    
    // Always show save button
    container.appendChild(createSaveButton());
    
    // Show resume button (check for saved state)
    sendMessageToBackground({ action: 'hasSavedState' })
      .then(response => {
        if (response.success && response.hasSaved) {
          container.appendChild(createResumeButton());
        }
      })
      .catch(err => {
        console.log('SessionLink: Could not check saved state', err);
        // Add resume button anyway - it will show error if no state
        container.appendChild(createResumeButton());
      });
    
    document.body.appendChild(container);
    console.log('SessionLink: Buttons injected');
  }

  // Watch for navigation changes (SPA support)
  function watchForNavigation() {
    let lastUrl = window.location.href;
    
    const observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        console.log('SessionLink: Navigation detected, reinitializing');
        setTimeout(initialize, 1000);
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Start the extension
  initialize();
  watchForNavigation();

})();
