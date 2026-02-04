/**
 * SessionLink Utility Functions
 * Helper functions for formatting, sanitization, and cross-browser compatibility
 */

(function(global) {
  'use strict';

  // Create namespace
  const SessionLinkUtils = {};

  /**
   * Cross-browser API wrapper
   * Provides a unified API that works across Chrome, Firefox, and other browsers
   */
  SessionLinkUtils.browserAPI = (function() {
    // Check if we're in a browser extension context
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      return chrome;
    }
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.id) {
      return browser;
    }
    // Fallback for non-extension context (testing)
    return null;
  })();

  /**
   * Promisified storage.local.get
   * @param {string|string[]} keys - Keys to retrieve
   * @returns {Promise<object>} - Retrieved data
   */
  SessionLinkUtils.storageGet = function(keys) {
    return new Promise((resolve, reject) => {
      const api = SessionLinkUtils.browserAPI;
      if (!api || !api.storage) {
        reject(new Error('Storage API not available'));
        return;
      }

      api.storage.local.get(keys, (result) => {
        if (api.runtime.lastError) {
          reject(new Error(api.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  };

  /**
   * Promisified storage.local.set
   * @param {object} data - Data to store
   * @returns {Promise<void>}
   */
  SessionLinkUtils.storageSet = function(data) {
    return new Promise((resolve, reject) => {
      const api = SessionLinkUtils.browserAPI;
      if (!api || !api.storage) {
        reject(new Error('Storage API not available'));
        return;
      }

      api.storage.local.set(data, () => {
        if (api.runtime.lastError) {
          reject(new Error(api.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  };

  /**
   * Sanitize HTML content to prevent XSS attacks
   * @param {string} html - Raw HTML string
   * @returns {string} - Sanitized text content
   */
  SessionLinkUtils.sanitizeHTML = function(html) {
    if (!html || typeof html !== 'string') {
      return '';
    }

    // Remove script tags and their content
    let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Remove style tags and their content
    sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // Remove all HTML tags
    sanitized = sanitized.replace(/<[^>]+>/g, '');
    
    // Remove javascript: URLs
    sanitized = sanitized.replace(/javascript:/gi, '');
    
    // Remove event handlers
    sanitized = sanitized.replace(/on\w+\s*=/gi, '');
    
    // Decode HTML entities
    sanitized = SessionLinkUtils.decodeHTMLEntities(sanitized);
    
    // Trim whitespace
    return sanitized.trim();
  };

  /**
   * Decode HTML entities
   * @param {string} text - Text with HTML entities
   * @returns {string} - Decoded text
   */
  SessionLinkUtils.decodeHTMLEntities = function(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    const entities = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&nbsp;': ' ',
      '&ndash;': '–',
      '&mdash;': '—',
      '&hellip;': '…'
    };

    return text.replace(/&[^;]+;/g, (entity) => {
      return entities[entity] || entity;
    });
  };

  /**
   * Format a resume prompt from conversation data
   * @param {object} data - Summary data object
   * @returns {string} - Formatted resume prompt
   */
  SessionLinkUtils.formatResumePrompt = function(data) {
    if (!data || !data.summary) {
      return '';
    }

    const header = `[SessionLink Context Restore - ${data.platform || 'Unknown Platform'}]`;
    const timestamp = data.timestamp ? `Saved: ${new Date(data.timestamp).toLocaleString()}` : '';
    
    return `${header}\n${timestamp}\n\n${data.summary}`;
  };

  /**
   * Generate a unique ID
   * @returns {string} - Unique identifier
   */
  SessionLinkUtils.generateId = function() {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${randomPart}`;
  };

  /**
   * Truncate text to a maximum length
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @param {string} suffix - Suffix to add if truncated
   * @returns {string} - Truncated text
   */
  SessionLinkUtils.truncate = function(text, maxLength = 100, suffix = '...') {
    if (!text || typeof text !== 'string') {
      return '';
    }

    if (text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength - suffix.length).trim() + suffix;
  };

  /**
   * Format relative time (e.g., "2 hours ago")
   * @param {string|Date} timestamp - Timestamp to format
   * @returns {string} - Formatted relative time
   */
  SessionLinkUtils.formatRelativeTime = function(timestamp) {
    if (!timestamp) {
      return 'Unknown';
    }

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) {
      return 'Just now';
    } else if (diffMin < 60) {
      return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    } else if (diffHour < 24) {
      return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
    } else if (diffDay < 7) {
      return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    }
  };

  /**
   * Debounce function execution
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} - Debounced function
   */
  SessionLinkUtils.debounce = function(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  /**
   * Throttle function execution
   * @param {Function} func - Function to throttle
   * @param {number} limit - Time limit in milliseconds
   * @returns {Function} - Throttled function
   */
  SessionLinkUtils.throttle = function(func, limit = 300) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => {
          inThrottle = false;
        }, limit);
      }
    };
  };

  /**
   * Deep clone an object
   * @param {object} obj - Object to clone
   * @returns {object} - Cloned object
   */
  SessionLinkUtils.deepClone = function(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      console.error('SessionLink: Deep clone failed', e);
      return obj;
    }
  };

  /**
   * Check if running in extension context
   * @returns {boolean}
   */
  SessionLinkUtils.isExtensionContext = function() {
    return !!(SessionLinkUtils.browserAPI && 
              SessionLinkUtils.browserAPI.runtime && 
              SessionLinkUtils.browserAPI.runtime.id);
  };

  /**
   * Log with SessionLink prefix
   * @param {string} level - Log level (log, warn, error)
   * @param {...any} args - Arguments to log
   */
  SessionLinkUtils.log = function(level, ...args) {
    const prefix = '[SessionLink]';
    const logFn = console[level] || console.log;
    logFn(prefix, ...args);
  };

  // Export to global scope
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SessionLinkUtils;
  } else {
    global.SessionLinkUtils = SessionLinkUtils;
  }

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
