import sys
import threading
import json
import time
import os
from concurrent.futures import ThreadPoolExecutor

# Fix for potential OpenMP conflicts (CTranslate2 + Torch)
# This fixes a crash that happens 50% of the time, all the time.
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# Optimize Python GC for lower latency
import gc
gc.set_threshold(50000, 500, 100)  # Less frequent GC

# Import services
from services.protocol import send_message, parse_message
from services.audio_capture import AudioCapture
from services.whisper_service import WhisperService
from services.ollama_client import OllamaClient
from services.input_service import InputService

# Thread pool for async operations
executor = ThreadPoolExecutor(max_workers=3)

def main():
    # Initialize Services
    send_message("status", {"text": "Initializing Python Services..."})
    
    try:
        # Use 'base.en' for balanced speed/quality, or 'tiny.en' for fastest
        whisper = WhisperService("base.en") 
        ollama = OllamaClient()
        input_service = InputService()
        audio_capture = AudioCapture()
        
        # --- Voice/Audio Wiring ---
        def on_ptt_press():
            audio_capture.start()

        def on_ptt_release():
            # Stop RECORDING immediately to be responsive
            audio_capture.stop_capture()
            
            # Offload processing using thread pool for better management
            def worker():
                audio_data = audio_capture.get_captured_audio()
                if audio_data is not None and len(audio_data) > 0:
                    process_voice(audio_data)
            
            executor.submit(worker)

        def process_voice(audio_data):
            try:
                # Skip processing if audio is too short (likely silence)
                if len(audio_data) < 1600:  # Less than 0.1s at 16kHz
                    send_message("status", {"text": "Ready"})
                    return
                    
                send_message("status", {"text": "Transcribing..."})
                text = whisper.transcribe(audio_data)
                
                if text and len(text.strip()) > 0:
                    send_message("transcription", {"text": text})
                
                send_message("status", {"text": "Ready"})
            except Exception as e:
                send_message("error", {"text": f"Transcription Failed: {e}"})

        input_service.on_press_callback = on_ptt_press
        input_service.on_release_callback = on_ptt_release

        send_message("status", {"text": "Ready"})
    except Exception as e:
        # The classic "catch-all-and-pray" strategy
        send_message("error", {"text": f"Initialization failed: {str(e)}"})
        return

    # Main Event Loop
    # Abandon all hope, ye who enter here. This loop is the heartbeat of chaos.
    for line in sys.stdin:
        # Debug Log
        # print(f"DEBUG RX: {line.strip()}", file=sys.stderr)
        
        msg = parse_message(line)
        if not msg:
            # print("DEBUG: Failed to parse JSON. JSON is hard.", file=sys.stderr)
            continue
            
        cmd_type = msg.get("type")
        payload = msg.get("payload", {})

        if cmd_type == "config:update":
             input_service.update_config(payload)

        elif cmd_type == "voice:get-devices":
             devices = audio_capture.list_devices()
             # Sending list of devices back to the abyss (Node.js)
             send_message("voice:devices", {"devices": devices})

        elif cmd_type == "voice:set-device":
             dev_index = payload.get("index")
             if dev_index is not None:
                 # casting to int because javascript sends everything as strings/objects/dreams/hopes
                 audio_capture.set_device(int(dev_index))

        elif cmd_type == "voice:start":
             on_ptt_press()

        elif cmd_type == "voice:stop":
             on_ptt_release()

        elif cmd_type == "transcribe:file":
            filepath = payload.get("filepath")
            if filepath and os.path.exists(filepath):
                send_message("status", {"text": "Transcribing..."})
                try:
                    # We pass the filepath directly. 
                    # WhisperService needs to be updated to handle file paths if it doesn't already.
                    # Actually openai-whisper handles file paths natively!
                    text = whisper.transcribe_file(filepath)
                    send_message("transcription", {"text": text})
                    
                    # Cleanup file
                    try:
                        os.remove(filepath)
                    except:
                        pass
                except Exception as e:
                    send_message("error", {"text": f"Transcription error: {str(e)}"})
            else:
                send_message("error", {"text": "File not found"})

        elif cmd_type == "ai:send":
            prompt = payload.get("prompt")
            model = payload.get("model", "llama3")
            system_prompt = payload.get("systemPrompt")
            
            if prompt:
                response_text = ollama.generate(model, prompt, system_prompt)
                if response_text:
                    send_message("ai:response", {"text": response_text}) 
                else:
                    send_message("error", {"text": "Ollama failed to respond"})

        elif cmd_type == "tts:scan-models":

             # Look for models in provided path or default locations
             candidates = []
             if payload.get("base_path"):
                 candidates.append(payload.get("base_path"))
             
             # Default Locations
             cwd = os.getcwd()
             # 1. ../GPT-SoVITS
             candidates.append(os.path.abspath(os.path.join(cwd, "..", "GPT-SoVITS")))
             # 2. ./gpt-sovits (Nested inside python)
             candidates.append(os.path.abspath(os.path.join(cwd, "gpt-sovits")))
             # 3. ./gpt-sovits/GPT_SoVITS/pretrained_models
             candidates.append(os.path.abspath(os.path.join(cwd, "gpt-sovits", "GPT_SoVITS", "pretrained_models")))
             # 4. ../GPT-SoVITS/GPT_SoVITS/pretrained_models
             candidates.append(os.path.abspath(os.path.join(cwd, "..", "GPT-SoVITS", "GPT_SoVITS", "pretrained_models")))

             gpt_models = set()
             sovits_models = set()
             
             for base_path in candidates:
                 if base_path and os.path.exists(base_path):
                     print(f"Log: Scanning for models in {base_path}", file=sys.stderr)
                     for root, dirs, files in os.walk(base_path):
                         for file in files:
                             path = os.path.join(root, file)
                             if file.endswith(".ckpt"):
                                 gpt_models.add(path)
                             elif file.endswith(".pth"):
                                 # Basic heuristic to avoid other pth files
                                 lower = file.lower()
                                 if "sovits" in lower or "s2" in lower or "g_" in lower or (not "d_" in lower and "model" in lower):
                                     sovits_models.add(path)
                                 
             send_message("tts:models", {"gpt": list(gpt_models), "sovits": list(sovits_models)})

if __name__ == "__main__":
    main()

