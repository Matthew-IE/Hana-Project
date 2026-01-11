import sys
import threading
import json
import time
import os

# Fix for potential OpenMP conflicts (CTranslate2 + Torch)
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# Import services
from services.protocol import send_message, parse_message
# AudioCapture is no longer used in favor of Frontend Recording + File Transcription
# from services.audio_capture import AudioCapture
from services.whisper_service import WhisperService
from services.ollama_client import OllamaClient

def main():
    # Initialize Services
    send_message("status", {"text": "Initializing Python Services..."})
    
    try:
        # Loading whisper might take a moment
        whisper = WhisperService("base.en") 
        ollama = OllamaClient()
        
        send_message("status", {"text": "Ready"})
    except Exception as e:
        send_message("error", {"text": f"Initialization failed: {str(e)}"})
        return

    # Main Event Loop
    for line in sys.stdin:
        # Debug Log
        print(f"DEBUG RX: {line.strip()}", file=sys.stderr)
        
        msg = parse_message(line)
        if not msg:
            print("DEBUG: Failed to parse JSON", file=sys.stderr)
            continue
            
        cmd_type = msg.get("type")
        payload = msg.get("payload", {})

        if cmd_type == "transcribe:file":
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
