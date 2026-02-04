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

1. **Scraping** your conversation (last 10-15 turns)
2. **Summarizing** it using AI into a structured "Context Handoff"
3. **Storing** the summary locally in your browser
4. **Injecting** it into new conversations with one click

## Features

- 🔗 **One-Click Save** - Capture your conversation context instantly
- 🔄 **Instant Resume** - Restore context in new chats with a single click
- 🤖 **Multi-Platform** - Works with ChatGPT, Claude, and Gemini
- 🔒 **100% Local** - Your API key and data never leave your device
- 🌙 **Dark Mode** - Beautiful UI that adapts to your system theme
- 🦊 **Cross-Browser** - Works on Chrome, Brave, Edge, and Firefox

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

### From Release (Recommended)

Download the latest release from the [Releases](https://github.com/sessionlink/extension/releases) page.

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
3. The saved context will be injected into the input
4. Press Enter to send and continue where you left off

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

- ✅ Your API key is stored locally in your browser
- ✅ Conversation data never leaves your device
- ✅ No analytics or tracking
- ✅ No external servers (except API calls to OpenAI/Gemini)
- ✅ Open source - audit the code yourself

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
│  ├─ DOM Observer         │  ├─ API Handler (OpenAI/Gemini) │
│  ├─ Button Injection     │  ├─ Storage Manager             │
│  └─ Message Scraping     │  └─ Lifecycle Events            │
├─────────────────────────────────────────────────────────────┤
│  Popup UI                │  Storage                         │
│  ├─ Settings Form        │  ├─ API Key (encrypted)         │
│  └─ Saved States List    │  └─ Saved Summaries             │
└─────────────────────────────────────────────────────────────┘
```

## Development

### Project Structure

```
sessionlink/
├── manifest.json           # Chrome/Edge manifest (MV3)
├── manifest.firefox.json   # Firefox manifest (MV3)
├── scripts/
│   ├── background.js       # Service worker
│   ├── content.js          # DOM manipulation
│   └── utils.js            # Helper functions
├── lib/
│   └── browser-polyfill.js # Cross-browser compatibility
├── ui/
│   ├── popup.html          # Extension popup
│   ├── popup.js            # Popup logic
│   ├── popup.css           # Popup styles
│   └── styles.css          # Injected button styles
├── pages/
│   ├── onboarding.html     # Welcome page
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
# Chrome/Edge
zip -r sessionlink-chrome.zip . -x "*.git*" -x "*.md" -x "manifest.firefox.json"

# Firefox
cp manifest.firefox.json manifest.json
zip -r sessionlink-firefox.zip . -x "*.git*" -x "*.md" -x "manifest.chrome.json"
```

### Testing

```bash
# Validate extension structure
node validate_extension.js

# Lint JavaScript (requires ESLint)
npx eslint scripts/*.js lib/*.js ui/*.js
```

## Supported Platforms

| Platform | Status | Notes |
|----------|--------|-------|
| ChatGPT (chatgpt.com) | ✅ Full Support | |
| ChatGPT (chat.openai.com) | ✅ Full Support | Legacy domain |
| Claude (claude.ai) | ✅ Full Support | |
| Gemini (gemini.google.com) | ✅ Full Support | |

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

## Acknowledgments

- Built with love for the AI community
- Inspired by the frustration of losing context in AI conversations
- Thanks to OpenAI and Google for their APIs

---

<p align="center">
  Made with ❤️ by the SessionLink Team
</p>
