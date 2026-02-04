/**
 * Browser Extension API Polyfill
 * Provides a unified API for Chrome and Firefox extensions
 * 
 * This is a minimal polyfill that wraps Chrome's callback-based API
 * to work consistently across browsers. For production use with complex
 * needs, consider using the full webextension-polyfill library.
 */

(function(global) {
  'use strict';

  // If browser API already exists (Firefox), no polyfill needed
  if (typeof browser !== 'undefined' && browser.runtime) {
    return;
  }

  // If chrome API doesn't exist, we're not in an extension context
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    return;
  }

  // Create browser namespace as an alias to chrome
  // This allows code to use either `browser` or `chrome` namespace
  global.browser = global.browser || {};

  // Helper to wrap callback-based API methods with Promises
  function wrapAsyncMethod(method, numCallbackArgs = 1) {
    return function(...args) {
      return new Promise((resolve, reject) => {
        const callback = (...results) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(numCallbackArgs === 1 ? results[0] : results);
          }
        };
        method.call(this, ...args, callback);
      });
    };
  }

  // Runtime API
  if (chrome.runtime) {
    global.browser.runtime = {
      ...chrome.runtime,
      sendMessage: function(message) {
        return new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              // Don't reject for "receiving end does not exist" errors
              // as this is common when popup is closed
              if (chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
                resolve(undefined);
              } else {
                reject(new Error(chrome.runtime.lastError.message));
              }
            } else {
              resolve(response);
            }
          });
        });
      },
      getURL: chrome.runtime.getURL.bind(chrome.runtime),
      getManifest: chrome.runtime.getManifest.bind(chrome.runtime),
      onMessage: chrome.runtime.onMessage,
      onInstalled: chrome.runtime.onInstalled,
      id: chrome.runtime.id,
      lastError: chrome.runtime.lastError
    };

    // Add setUninstallURL if available
    if (chrome.runtime.setUninstallURL) {
      global.browser.runtime.setUninstallURL = function(url) {
        return new Promise((resolve, reject) => {
          chrome.runtime.setUninstallURL(url, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      };
    }
  }

  // Storage API
  if (chrome.storage) {
    global.browser.storage = {
      local: {
        get: function(keys) {
          return new Promise((resolve, reject) => {
            chrome.storage.local.get(keys, (result) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(result);
              }
            });
          });
        },
        set: function(items) {
          return new Promise((resolve, reject) => {
            chrome.storage.local.set(items, () => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          });
        },
        remove: function(keys) {
          return new Promise((resolve, reject) => {
            chrome.storage.local.remove(keys, () => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          });
        },
        clear: function() {
          return new Promise((resolve, reject) => {
            chrome.storage.local.clear(() => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          });
        }
      },
      sync: chrome.storage.sync ? {
        get: function(keys) {
          return new Promise((resolve, reject) => {
            chrome.storage.sync.get(keys, (result) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(result);
              }
            });
          });
        },
        set: function(items) {
          return new Promise((resolve, reject) => {
            chrome.storage.sync.set(items, () => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          });
        }
      } : undefined,
      onChanged: chrome.storage.onChanged
    };
  }

  // Tabs API
  if (chrome.tabs) {
    global.browser.tabs = {
      query: function(queryInfo) {
        return new Promise((resolve, reject) => {
          chrome.tabs.query(queryInfo, (tabs) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(tabs);
            }
          });
        });
      },
      create: function(createProperties) {
        return new Promise((resolve, reject) => {
          chrome.tabs.create(createProperties, (tab) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(tab);
            }
          });
        });
      },
      update: function(tabId, updateProperties) {
        return new Promise((resolve, reject) => {
          chrome.tabs.update(tabId, updateProperties, (tab) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(tab);
            }
          });
        });
      },
      sendMessage: function(tabId, message) {
        return new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
      },
      onUpdated: chrome.tabs.onUpdated,
      onRemoved: chrome.tabs.onRemoved
    };
  }

  // Scripting API (Manifest V3)
  if (chrome.scripting) {
    global.browser.scripting = {
      executeScript: function(injection) {
        return new Promise((resolve, reject) => {
          chrome.scripting.executeScript(injection, (results) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(results);
            }
          });
        });
      },
      insertCSS: function(injection) {
        return new Promise((resolve, reject) => {
          chrome.scripting.insertCSS(injection, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      }
    };
  }

  // Action API (Manifest V3) / Browser Action API (Manifest V2)
  const actionAPI = chrome.action || chrome.browserAction;
  if (actionAPI) {
    global.browser.action = {
      setIcon: function(details) {
        return new Promise((resolve, reject) => {
          actionAPI.setIcon(details, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      },
      setBadgeText: function(details) {
        return new Promise((resolve, reject) => {
          actionAPI.setBadgeText(details, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      },
      setBadgeBackgroundColor: function(details) {
        return new Promise((resolve, reject) => {
          actionAPI.setBadgeBackgroundColor(details, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      },
      onClicked: actionAPI.onClicked
    };
  }

  console.log('SessionLink: Browser polyfill loaded');

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
