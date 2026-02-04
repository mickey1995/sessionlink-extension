/**
 * SessionLink Background Service Worker
 * Handles API calls, storage management, and lifecycle events
 */

// Use appropriate API based on environment
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Summarization system prompt
const SUMMARIZATION_PROMPT = `Analyze this conversation history. Create a 'Context Handoff' summary for another AI instance.

STRUCTURE:
1. **Project Goal:** (1 sentence)
2. **Current Tech Stack:** (Languages, frameworks decided on)
3. **Progress Snapshot:** (What is working, what is broken)
4. **Immediate Next Step:** (The very next task to perform)
5. **Code Context:** (Key variable names or architectural decisions)

OUTPUT: A single, copy-pasteable prompt block starting with 'SYSTEM HANDOFF:'.

If the conversation is not about a coding project, adapt the structure to:
1. **Main Topic:** (1 sentence summary)
2. **Key Points Discussed:** (Important information covered)
3. **Current Status:** (Where the conversation left off)
4. **Next Steps:** (What should happen next)
5. **Important Context:** (Critical details to remember)`;

// Message listener for content script communication
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(error => {
      console.error('SessionLink Background Error:', error);
      sendResponse({ success: false, error: error.message });
    });
  
  // Return true to indicate async response
  return true;
});

// Handle incoming messages
async function handleMessage(message, sender) {
  switch (message.action) {
    case 'summarize':
      return await handleSummarize(message);
    
    case 'getLastSave':
      return await getLastSave();
    
    case 'getAllSaves':
      return await getAllSaves();
    
    case 'hasSavedState':
      return await hasSavedState();
    
    case 'deleteSave':
      return await deleteSave(message.id);
    
    case 'getSettings':
      return await getSettings();
    
    case 'saveSettings':
      return await saveSettings(message.settings);
    
    default:
      return { success: false, error: 'Unknown action' };
  }
}

// Handle summarization request
async function handleSummarize(message) {
  const settings = await getSettings();
  
  if (!settings.data || !settings.data.apiKey) {
    return { 
      success: false, 
      error: 'API key not configured. Please open the extension popup and add your API key.' 
    };
  }

  const { apiKey, apiProvider } = settings.data;
  
  try {
    let summary;
    
    if (apiProvider === 'openai') {
      summary = await callOpenAI(apiKey, message.conversation);
    } else if (apiProvider === 'gemini') {
      summary = await callGemini(apiKey, message.conversation);
    } else {
      return { success: false, error: 'Invalid API provider' };
    }

    // Save the summary
    const saveData = {
      id: generateId(),
      summary: summary,
      platform: message.platform,
      url: message.url,
      timestamp: message.timestamp,
      preview: summary.substring(0, 100) + '...'
    };

    await saveSummary(saveData);
    
    return { success: true, data: saveData };
    
  } catch (error) {
    console.error('Summarization error:', error);
    return { success: false, error: error.message };
  }
}

// Call OpenAI API
async function callOpenAI(apiKey, conversation) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
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
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Call Gemini API
async function callGemini(apiKey, conversation) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: SUMMARIZATION_PROMPT + '\n\n---\n\nCONVERSATION:\n' + conversation }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1000
        }
      })
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

// Storage functions
async function saveSummary(saveData) {
  return new Promise((resolve, reject) => {
    browserAPI.storage.local.get(['saves'], (result) => {
      if (browserAPI.runtime.lastError) {
        reject(new Error(browserAPI.runtime.lastError.message));
        return;
      }
      
      const saves = result.saves || [];
      saves.unshift(saveData); // Add to beginning
      
      // Keep only last 20 saves
      const trimmedSaves = saves.slice(0, 20);
      
      browserAPI.storage.local.set({ saves: trimmedSaves }, () => {
        if (browserAPI.runtime.lastError) {
          reject(new Error(browserAPI.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  });
}

async function getLastSave() {
  return new Promise((resolve) => {
    browserAPI.storage.local.get(['saves'], (result) => {
      if (browserAPI.runtime.lastError) {
        resolve({ success: false, error: browserAPI.runtime.lastError.message });
        return;
      }
      
      const saves = result.saves || [];
      if (saves.length > 0) {
        resolve({ success: true, data: saves[0] });
      } else {
        resolve({ success: false, error: 'No saved states found' });
      }
    });
  });
}

async function getAllSaves() {
  return new Promise((resolve) => {
    browserAPI.storage.local.get(['saves'], (result) => {
      if (browserAPI.runtime.lastError) {
        resolve({ success: false, error: browserAPI.runtime.lastError.message });
        return;
      }
      
      resolve({ success: true, data: result.saves || [] });
    });
  });
}

async function hasSavedState() {
  return new Promise((resolve) => {
    browserAPI.storage.local.get(['saves'], (result) => {
      if (browserAPI.runtime.lastError) {
        resolve({ success: false, error: browserAPI.runtime.lastError.message });
        return;
      }
      
      const saves = result.saves || [];
      resolve({ success: true, hasSaved: saves.length > 0 });
    });
  });
}

async function deleteSave(id) {
  return new Promise((resolve, reject) => {
    browserAPI.storage.local.get(['saves'], (result) => {
      if (browserAPI.runtime.lastError) {
        reject(new Error(browserAPI.runtime.lastError.message));
        return;
      }
      
      const saves = result.saves || [];
      const filteredSaves = saves.filter(save => save.id !== id);
      
      browserAPI.storage.local.set({ saves: filteredSaves }, () => {
        if (browserAPI.runtime.lastError) {
          reject(new Error(browserAPI.runtime.lastError.message));
        } else {
          resolve({ success: true });
        }
      });
    });
  });
}

async function getSettings() {
  return new Promise((resolve) => {
    browserAPI.storage.local.get(['settings'], (result) => {
      if (browserAPI.runtime.lastError) {
        resolve({ success: false, error: browserAPI.runtime.lastError.message });
        return;
      }
      
      resolve({ success: true, data: result.settings || {} });
    });
  });
}

async function saveSettings(settings) {
  return new Promise((resolve, reject) => {
    browserAPI.storage.local.set({ settings }, () => {
      if (browserAPI.runtime.lastError) {
        reject(new Error(browserAPI.runtime.lastError.message));
      } else {
        resolve({ success: true });
      }
    });
  });
}

// Utility functions
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Lifecycle events
browserAPI.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open onboarding page on first install
    browserAPI.tabs.create({
      url: browserAPI.runtime.getURL('pages/onboarding.html')
    });
    
    // Initialize default settings
    browserAPI.storage.local.set({
      settings: {
        apiProvider: 'openai',
        apiKey: ''
      },
      saves: []
    });
    
    console.log('SessionLink: Extension installed');
  } else if (details.reason === 'update') {
    console.log('SessionLink: Extension updated to version', browserAPI.runtime.getManifest().version);
  }
});

// Handle uninstall - set uninstall URL
browserAPI.runtime.setUninstallURL(
  browserAPI.runtime.getURL('pages/uninstall.html')
).catch(() => {
  // Fallback for browsers that don't support setUninstallURL with extension URLs
  console.log('SessionLink: Could not set uninstall URL');
});

console.log('SessionLink: Background service worker initialized');
