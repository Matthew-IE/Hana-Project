import sys
import threading
import json
import time
import os

# Fix for potential OpenMP conflicts (CTranslate2 + Torch)
# This fixes a crash that happens 50% of the time, all the time.
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# Import services
from services.protocol import send_message, parse_message
from services.audio_capture import AudioCapture
from services.whisper_service import WhisperService
from services.ollama_client import OllamaClient
from services.input_service import InputService

def main():
    # Initialize Services
    send_message("status", {"text": "Initializing Python Services..."})
    
    try:
        # Loading whisper might take a moment
        whisper = WhisperService("base.en") 
        ollama = OllamaClient()
        input_service = InputService()
        audio_capture = AudioCapture()
        
        # --- Voice/Audio Wiring ---
        def on_ptt_press():
            # print("DEBUG: PTT Press", file=sys.stderr)
            audio_capture.start()

        def on_ptt_release():
            # print("DEBUG: PTT Release", file=sys.stderr)
            audio_data = audio_capture.stop()
            if audio_data is not None:
                # Process in separate thread to avoid blocking input loop
                threading.Thread(target=process_voice, args=(audio_data,)).start()

        def process_voice(audio_data):
            try:
                send_message("status", {"text": "Transcribing..."})
                text = whisper.transcribe(audio_data)
                print(f"Log: Transcribed '{text}'", file=sys.stderr)
                
                if text and len(text.strip()) > 0:
                     send_message("transcription", {"text": text})
                     # Optional: Auto-submit to LLM? 
                     # For now, we trust the Frontend to see the transcription and decide.
                     # Because trusting frontend developers is always a great idea.
                
                send_message("status", {"text": "Ready"})
            except Exception as e:
                send_message("error", {"text": f"Transcription Failed: {e}"})

        input_service.on_press_callback = on_ptt_press
        input_service.on_release_callback = on_ptt_release

        send_message("status", {"text": "Ready"})
    except Exception as e:
        send_message("error", {"text": f"Initialization failed: {str(e)}"})
        return

    # Main Event Loop
    # Abandon all hope, ye who enter here.
    for line in sys.stdin:
        # Debug Log
        # print(f"DEBUG RX: {line.strip()}", file=sys.stderr)
        
        msg = parse_message(line)
        if not msg:
            # print("DEBUG: Failed to parse JSON", file=sys.stderr)
            continue
            
        cmd_type = msg.get("type")
        payload = msg.get("payload", {})

        if cmd_type == "config:update":
             input_service.update_config(payload)

        elif cmd_type == "voice:get-devices":
             devices = audio_capture.list_devices()
             send_message("voice:devices", {"devices": devices})

        elif cmd_type == "voice:set-device":
             dev_index = payload.get("index")
             if dev_index is not None:
                 # casting to int because javascript sends everything as strings/objects/dreams
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


if __name__ == "__main__":
    main()
