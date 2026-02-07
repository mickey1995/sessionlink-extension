/**
 * SessionLink Background Service Worker
 * Handles API calls, storage management, and lifecycle events.
 *
 * Key fixes in this version:
 *  - Uses raw chrome.* APIs with callbacks (service workers cannot load
 *    the browser-polyfill script, and Promises from polyfill caused
 *    sendResponse to be called after the port closed).
 *  - sendResponse is called synchronously inside the callback chain;
 *    `return true` keeps the message channel open for the async work.
 */

// ── Summarisation system prompt ──────────────────────────────────────
var SUMMARIZATION_PROMPT =
  'Analyze this conversation history. Create a \'Context Handoff\' summary for another AI instance.\n\n' +
  'STRUCTURE:\n' +
  '1. **Project Goal:** (1 sentence)\n' +
  '2. **Current Tech Stack:** (Languages, frameworks decided on)\n' +
  '3. **Progress Snapshot:** (What is working, what is broken)\n' +
  '4. **Immediate Next Step:** (The very next task to perform)\n' +
  '5. **Code Context:** (Key variable names or architectural decisions)\n\n' +
  'OUTPUT: A single, copy-pasteable prompt block starting with \'SYSTEM HANDOFF:\'.\n\n' +
  'If the conversation is not about a coding project, adapt the structure to:\n' +
  '1. **Main Topic:** (1 sentence summary)\n' +
  '2. **Key Points Discussed:** (Important information covered)\n' +
  '3. **Current Status:** (Where the conversation left off)\n' +
  '4. **Next Steps:** (What should happen next)\n' +
  '5. **Important Context:** (Critical details to remember)';

// ── Message listener ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  // We MUST return true to signal that sendResponse will be called async.
  handleMessage(message, sendResponse);
  return true;
});

function handleMessage(message, sendResponse) {
  switch (message.action) {
    case 'summarize':
      handleSummarize(message, sendResponse);
      break;
    case 'getLastSave':
      getLastSave(sendResponse);
      break;
    case 'getAllSaves':
      getAllSaves(sendResponse);
      break;
    case 'hasSavedState':
      hasSavedState(sendResponse);
      break;
    case 'deleteSave':
      deleteSave(message.id, sendResponse);
      break;
    case 'getSettings':
      getSettings(sendResponse);
      break;
    case 'saveSettings':
      saveSettings(message.settings, sendResponse);
      break;
    default:
      sendResponse({ success: false, error: 'Unknown action: ' + message.action });
  }
}

// ── Summarise ────────────────────────────────────────────────────────
function handleSummarize(message, sendResponse) {
  chrome.storage.local.get(['settings'], function (result) {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
      return;
    }

    var settings = result.settings || {};
    if (!settings.apiKey) {
      sendResponse({
        success: false,
        error: 'API key not configured. Open the SessionLink popup and add your API key.'
      });
      return;
    }

    var provider = settings.apiProvider || 'openai';
    var apiKey = settings.apiKey;

    var fetchPromise;
    if (provider === 'openai') {
      fetchPromise = callOpenAI(apiKey, message.conversation);
    } else if (provider === 'gemini') {
      fetchPromise = callGemini(apiKey, message.conversation);
    } else {
      sendResponse({ success: false, error: 'Invalid API provider: ' + provider });
      return;
    }

    fetchPromise
      .then(function (summary) {
        var saveData = {
          id: generateId(),
          summary: summary,
          platform: message.platform || 'Unknown',
          url: message.url || '',
          timestamp: message.timestamp || new Date().toISOString(),
          preview: summary.substring(0, 120)
        };

        saveSummary(saveData, function (err) {
          if (err) {
            sendResponse({ success: false, error: 'Saved summary but storage failed: ' + err });
          } else {
            sendResponse({ success: true, data: saveData });
          }
        });
      })
      .catch(function (err) {
        console.error('SessionLink: summarization error', err);
        sendResponse({ success: false, error: err.message || String(err) });
      });
  });
}

// ── OpenAI API ───────────────────────────────────────────────────────
function callOpenAI(apiKey, conversation) {
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SUMMARIZATION_PROMPT },
        { role: 'user', content: conversation }
      ],
      max_tokens: 1000,
      temperature: 0.3
    })
  }).then(function (response) {
    if (!response.ok) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        throw new Error((body.error && body.error.message) || 'OpenAI API error: ' + response.status);
      });
    }
    return response.json();
  }).then(function (data) {
    return data.choices[0].message.content;
  });
}

// ── Gemini API ───────────────────────────────────────────────────────
function callGemini(apiKey, conversation) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: SUMMARIZATION_PROMPT + '\n\n---\n\nCONVERSATION:\n' + conversation }]
      }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1000 }
    })
  }).then(function (response) {
    if (!response.ok) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        throw new Error((body.error && body.error.message) || 'Gemini API error: ' + response.status);
      });
    }
    return response.json();
  }).then(function (data) {
    return data.candidates[0].content.parts[0].text;
  });
}

// ── Storage helpers (all callback-based) ─────────────────────────────
function saveSummary(saveData, callback) {
  chrome.storage.local.get(['saves'], function (result) {
    if (chrome.runtime.lastError) {
      callback(chrome.runtime.lastError.message);
      return;
    }
    var saves = result.saves || [];
    saves.unshift(saveData);
    if (saves.length > 20) saves = saves.slice(0, 20);

    chrome.storage.local.set({ saves: saves }, function () {
      if (chrome.runtime.lastError) {
        callback(chrome.runtime.lastError.message);
      } else {
        callback(null);
      }
    });
  });
}

function getLastSave(sendResponse) {
  chrome.storage.local.get(['saves'], function (result) {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
      return;
    }
    var saves = result.saves || [];
    if (saves.length > 0) {
      sendResponse({ success: true, data: saves[0] });
    } else {
      sendResponse({ success: false, error: 'No saved states found' });
    }
  });
}

function getAllSaves(sendResponse) {
  chrome.storage.local.get(['saves'], function (result) {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
      return;
    }
    sendResponse({ success: true, data: result.saves || [] });
  });
}

function hasSavedState(sendResponse) {
  chrome.storage.local.get(['saves'], function (result) {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
      return;
    }
    var saves = result.saves || [];
    sendResponse({ success: true, hasSaved: saves.length > 0 });
  });
}

function deleteSave(id, sendResponse) {
  chrome.storage.local.get(['saves'], function (result) {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
      return;
    }
    var saves = result.saves || [];
    var filtered = [];
    for (var i = 0; i < saves.length; i++) {
      if (saves[i].id !== id) filtered.push(saves[i]);
    }
    chrome.storage.local.set({ saves: filtered }, function () {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true });
      }
    });
  });
}

function getSettings(sendResponse) {
  chrome.storage.local.get(['settings'], function (result) {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
      return;
    }
    sendResponse({ success: true, data: result.settings || {} });
  });
}

function saveSettings(settings, sendResponse) {
  chrome.storage.local.set({ settings: settings }, function () {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
    } else {
      sendResponse({ success: true });
    }
  });
}

// ── Utility ──────────────────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
}

// ── Lifecycle events ─────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/onboarding.html') });

    chrome.storage.local.set({
      settings: { apiProvider: 'openai', apiKey: '' },
      saves: []
    });
    console.log('SessionLink: installed');
  } else if (details.reason === 'update') {
    console.log('SessionLink: updated to', chrome.runtime.getManifest().version);
  }
});

// Uninstall URL (external page only; extension pages won't work after uninstall)
try {
  chrome.runtime.setUninstallURL('https://sessionlink.dev/uninstall');
} catch (e) {
  // Ignore if not supported
}

console.log('SessionLink: background service worker ready');
