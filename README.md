# SessionLink - AI Memory Bridge

<p align="center">
  <img src="icons/icon128.png" alt="SessionLink Logo" width="128" height="128">
</p>

<p align="center">
  <strong>Never lose your AI conversation context again.</strong><br>
  Save, summarize, and resume your chats seamlessly across ChatGPT, Claude, and Gemini.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#api-setup">API Setup</a> •
  <a href="#privacy">Privacy</a> •
  <a href="#development">Development</a>
</p>

---

## The Problem

AI chatbots have a "goldfish memory" problem. Every time you start a new conversation, you lose all the context from your previous session. This means:

- Repeating yourself constantly
- Re-explaining your project setup
- Losing track of decisions made
- Wasting time rebuilding context

## The Solution

**SessionLink** solves this by:

1. **Scraping** your conversation (last 15 turns)
2. **Summarizing** it using AI into a structured "Context Handoff"
3. **Storing** the summary locally in your browser
4. **Injecting** it into new conversations with one click and auto-sending

## Features

- **One-Click Save** - Capture your conversation context instantly
- **Instant Resume** - Restore context in new chats with a single click (auto-sends)
- **Multi-Platform** - Works with ChatGPT, Claude, and Gemini
- **100% Local** - Your API key and data never leave your device
- **Dark Mode** - Beautiful UI that adapts to your system theme
- **Cross-Browser** - Works on Chrome, Brave, Edge, and Firefox

## Installation

### Chrome / Brave / Edge (Chromium)

1. Download or clone this repository
2. Open `chrome://extensions/` in your browser
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `sessionlink` folder

### Firefox

1. Download or clone this repository
2. Rename `manifest.firefox.json` to `manifest.json` (backup the original)
3. Open `about:debugging#/runtime/this-firefox`
4. Click "Load Temporary Add-on"
5. Select the `manifest.json` file

## Usage

### Setting Up

1. Click the SessionLink icon in your browser toolbar
2. Select your API provider (OpenAI or Gemini)
3. Enter your API key
4. Click "Save Settings"

### Saving Context

1. Navigate to ChatGPT, Claude, or Gemini
2. Have a conversation you want to save
3. Click the floating **"Save State"** button (bottom right)
4. Wait for the AI to summarize your conversation
5. Done! Your context is saved locally

### Resuming Context

1. Start a new chat on any supported platform
2. Click the floating **"Resume State"** button
3. The saved context is injected into the input and **auto-sent**
4. The AI picks up right where you left off

## API Setup

SessionLink requires an API key to summarize your conversations. Your key is stored locally and never sent to our servers.

### OpenAI

1. Go to [OpenAI API Keys](https://platform.openai.com/api-keys)
2. Create a new API key
3. Copy and paste it into SessionLink settings

### Google Gemini

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Copy and paste it into SessionLink settings

## Privacy

SessionLink is built with a **local-first** security model:

- Your API key is stored locally in your browser
- Conversation data never leaves your device (except to your chosen API for summarization)
- No analytics or tracking
- No external servers
- Open source - audit the code yourself

## How It Works

### The Summarization Prompt

When you save a conversation, SessionLink sends it to your chosen AI with this prompt:

```
Analyze this conversation history. Create a 'Context Handoff' summary for another AI instance.

STRUCTURE:
1. **Project Goal:** (1 sentence)
2. **Current Tech Stack:** (Languages, frameworks decided on)
3. **Progress Snapshot:** (What is working, what is broken)
4. **Immediate Next Step:** (The very next task to perform)
5. **Code Context:** (Key variable names or architectural decisions)

OUTPUT: A single, copy-pasteable prompt block starting with 'SYSTEM HANDOFF:'.
```

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser Extension                       │
├─────────────────────────────────────────────────────────────┤
│  Content Script          │  Background Worker               │
│  ├─ Platform Detection   │  ├─ API Handler (OpenAI/Gemini) │
│  ├─ Button Injection     │  ├─ Storage Manager             │
│  ├─ Conversation Scrape  │  └─ Lifecycle Events            │
│  └─ Auto-Send on Resume  │                                  │
├─────────────────────────────────────────────────────────────┤
│  Popup UI                │  Storage (chrome.storage.local)  │
│  ├─ Settings Form        │  ├─ API Key & Provider          │
│  └─ Saved States List    │  └─ Saved Summaries (up to 20)  │
└─────────────────────────────────────────────────────────────┘
```

## Development

### Project Structure

```
sessionlink/
├── manifest.json           # Chrome/Edge/Brave manifest (MV3)
├── manifest.firefox.json   # Firefox manifest (MV3 + gecko settings)
├── scripts/
│   ├── background.js       # Service worker: API calls, storage, lifecycle
│   ├── content.js          # Content script: DOM injection, scraping, resume
│   └── utils.js            # Helper functions and cross-browser utilities
├── lib/
│   └── browser-polyfill.js # Cross-browser API polyfill (reference)
├── ui/
│   ├── popup.html          # Extension popup
│   ├── popup.js            # Popup logic: settings persistence, saves display
│   ├── popup.css           # Popup styles (dark-mode compatible)
│   └── styles.css          # Injected button and notification styles
├── pages/
│   ├── onboarding.html     # Welcome page (opens on install)
│   └── uninstall.html      # Goodbye page
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

### Building

No build step required! The extension runs directly from source.

For production packaging:

```bash
# Chrome/Edge/Brave
zip -r sessionlink-chrome.zip . -x "*.git*" "manifest.firefox.json" "node_modules/*"

# Firefox
cp manifest.firefox.json manifest.json
zip -r sessionlink-firefox.zip . -x "*.git*" "node_modules/*"
```

## Supported Platforms

| Platform | Status | Notes |
|----------|--------|-------|
| ChatGPT (chatgpt.com) | Full Support | |
| ChatGPT (chat.openai.com) | Full Support | Legacy domain |
| Claude (claude.ai) | Full Support | |
| Gemini (gemini.google.com) | Full Support | |

## Changelog

### v1.1.0 (2026-02-07)
- **Fixed:** Settings now persist correctly across popup open/close cycles
- **Fixed:** Content script messaging uses callback-based `chrome.runtime.sendMessage` for reliable service worker communication
- **Fixed:** Resume injects text AND auto-sends via send button click / Enter key
- **Fixed:** ChatGPT ProseMirror contenteditable input handling with native setter bypass
- **Fixed:** Removed unnecessary polyfill dependency from content scripts
- **Updated:** DOM selectors for ChatGPT, Claude, and Gemini (Feb 2026)
- **Added:** Comprehensive test suite (37 unit tests + 14 browser integration tests, all passing)

### v1.0.0 (2026-02-04)
- Initial release

## Troubleshooting

### "API key not configured"

Open the extension popup and add your API key in the Settings tab.

### Buttons not appearing

1. Refresh the page
2. Check if the extension is enabled in `chrome://extensions/`
3. Make sure you're on a supported platform

### "Failed to save context"

1. Check your API key is valid
2. Ensure you have API credits remaining
3. Check your internet connection

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Made with care by the SessionLink Team
</p>
