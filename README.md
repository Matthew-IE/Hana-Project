<div align="center">
  <img src="resources/media/hana.png" alt="Hana Logo" width="150" />
  <h1>🌸 Hana Project</h1>
  
  <p>
    <b>The Ultimate AI Desktop Companion.</b><br>
    <i>Integrated with LLMs, Voice Recognition, and High-Quality TTS.</i>
  </p>
  
  <img src="resources/media/hanapreview.png" alt="Hana Preview" width="100%" />
</div>

<br />

**Hana** is a fully customizable desktop companion that lives on your screen. She isn't just a 3D model, she can hear you, understand you, and speak back to you using advanced local AI.

---

## ✨ Features

### 🧠 AI & Intelligence
*   **LLM Integration**: Powered by **Ollama** (Llama3, Mistral, etc.) for local, private, and intelligent conversations.

### 🎙️ Voice Interaction
*   **Push-to-Talk (PTT)**: Global, system-wide PTT keybind (Mouse or Keyboard) support.
*   **Whisper STT**: State-of-the-art speech recognition using OpenAI's Whisper model (runs locally via Python).
*   **GPT-SoVITS Support**: Full integration with the GPT-SoVITS inference engine for high-quality, realistic voice synthesis.
    *   *Lip-syncs perfectly with the 3D model.*
    *   *Requires manual setup of the GPT-SoVITS engine.*

### 🖥️ Desktop Companion
*   **Transparent Overlay**: Renders directly on top of your windows.
*   **Click-Through**: Work seamlessly while she watches you. Toggle interaction with `F8`.
*   **Smart Tracking**: Eyes and Head track your mouse cursor naturally.

---

## 🛠️ Prerequisites

1.  **Node.js** (v18+ recommended)
2.  **Python 3.10+** (Required for AI services)
3.  **Ollama**: [Download Here](https://ollama.com/). Ensure you have pulled a model (e.g., `ollama pull llama3`).
4.  **CUDA capable GPU** (Strongly recommended for Whisper & GPT-SoVITS).

---

## 🚀 Installation Guide

### 1. Clone & Core Setup
```bash
git clone https://github.com/Matthew-IE/hana-project.git
cd hana-project
npm run install:all
```

### 2. Python Environment (AI Services)
Hana uses a local Python backend for Speech-to-Text (Whisper).
```bash
cd python
python -m venv venv
# Windows
.\venv\Scripts\activate
# Install requirements
pip install -r requirements.txt
```
*Note: You may need to install PyTorch manually with CUDA support if the default install doesn't pick it up.*

### 3. GPT-SoVITS Setup (TTS)
Hana does **not** bundle the TTS engine or voice models. You must set it up manually:

1.  Download the **GPT-SoVITS** package (Beta/v2) from the official [RVC-Boss/GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) repository or their releases. Tested on Windows, download the integrated package, follow instructions on their repo to install the pretrained models, run once, then continue here.
2.  Extract the contents of the GPT-SoVITS folder into: `hana-project/python/gpt-sovits/`.
3.  Ensure the structure looks like this:
    ```
    Hana-Project/
    ├── python/
    │   ├── gpt-sovits/
    │   │   ├── runtime/ (Python environment if included, or use venv)
    │   │   ├── GPT_SoVITS/ (Source code)
    │   │   ├── api_v2.py
    │   │   └── ...
    │   ├── services/
    │   ├── main.py
    │   └── ...
    ```
4.  **Important**: You must provide your own Reference Audio and Weights (`.pth` / `.ckpt`) for the voice you want to use. Place them in a known location and configure them in the Hana Controller.

### 4. Native Modules
If you have issues with Global Hooks (PTT) not working:
```bash
cd hana-companion
npm rebuild --build-from-source
```

---

## ▶️ Usage

Start the entire system with one command:

```bash
npm run dev
```

This launches:
1.  **Hana Core** (Electron + Overlay).
2.  **Hana Controller** (Web Interface).
3.  **Python AI Backend** (Whisper + Audio Capture).
4.  **GPT-SoVITS** (If enabled in config, make sure GPT-SoVITS is installed).

### ⌨️ Controls
*   **F8**: Toggle Click-Through (Click "through" the model vs Dragging the model).
*   **PTT Key**: Configurable in Settings (Default: `V` or `Mouse4`). Hold to speak, release to send.
    *   *Indicator*: A red "Listening..." pill will appear in the top right of the screen when active.

---

## ⚙️ Customization

Open the **Controller** (usually `http://localhost:5173`), or open the dedicated GUI in her System Tray to:
*   Adjust **Voice Settings** (Select different GPT-SoVITS weights).
*   Tweak **AI Personality** (System Prompt).
*   Debug **Animations**.

---

## 🔧 Troubleshooting

*   **"Startup timed out"**: The TTS engine might take a minute to load. Check that `python/gpt-sovits/api_v2.py` exists.
*   **Ollama Error**: Ensure Ollama is running (`ollama serve`) and the model specified in `config.json` is pulled.

---

## 📂 Project Structure

```
hana-project/
├── hana-companion/       # Electron Desktop Application
│   ├── electron/         # Main process & Window management
│   ├── src/              # Renderer process (Three.js code)
│   └── public/           # Assets (Models, Icons)
│
├── hana-controller/      # Web Dashboard
│   ├── src/              # React UI Components
│   └── resources/        # Controller-specific assets
│
├── python/               # AI Backend
│   ├── gpt-sovits/       # (User Installed) GPT-SoVITS Engine
│   ├── services/         # Whisper & Audio Capture
│   ├── venv/             # Python Virtual Environment
│   └── main.py           # Python Entry Point
│
└── package.json          # Root scripts for monolithic management
```

## 🗺️ Roadmap

- [x] **Core Companion**: VRM rendering on transparent window.
- [x] **Smart Tracking**: Eye and head tracking with mouse interaction.
- [x] **Controller UI**: Web-based remote control for settings and debugging.
- [x] **Physics & Animations**: Bone-based rotation and idle animation system.
- [x] **AI Integration**: Local LLM connection via Ollama.
- [x] **Voice Communication**: Speech-to-Text via Whisper (Push-to-Talk).
- [ ] **Memory System**: Context-aware interactions based on past conversations.
- [ ] **Emotional Engine**: Automatic emotion recognition and reaction.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

<div align="center">
  <i>Created by Matthew</i>
</div>
