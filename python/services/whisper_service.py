import whisper # type: ignore
import numpy as np # type: ignore
import os
import sys
import torch # type: ignore

class WhisperService:
    def __init__(self, model_size="base.en"):
        self.model_size = model_size
        
        try:
            # Check for CUDA availability
            if torch.cuda.is_available():
                self.device = "cuda"
                print("Attempting to load OpenAI Whisper on CUDA...", file=sys.stderr)
            else:
                self.device = "cpu"
                print("CUDA not available. Loading OpenAI Whisper on CPU...", file=sys.stderr)
            
            self.model = whisper.load_model(model_size, device=self.device)
            print(f"OpenAI Whisper ({model_size}) loaded on {self.device}.", file=sys.stderr)
            
        except Exception as e:
            print(f"Failed to load Whisper: {str(e)}", file=sys.stderr)
            raise e

    def transcribe(self, audio_data, sample_rate=16000):
        """
        Transcribe raw numpy audio data.
        audio_data: float32 numpy array
        """
        # Flatten if stereo, whisper expects mono
        if len(audio_data.shape) > 1:
            audio_data = audio_data.flatten()
        
        # Ensure data is float32
        if audio_data.dtype != np.float32:
             audio_data = audio_data.astype(np.float32)

        # Transcribe directly using the OpenAI Whisper transcribe method
        # It handles normalization and padding internally
        # fp16=False suppresses the warning on CPU
        is_fp16 = (self.device == "cuda")
        result = self.model.transcribe(audio_data, fp16=is_fp16)
        
        return result["text"].strip()

    def transcribe_file(self, file_path):
        """
        Transcribe audio from a file path.
        """
        is_fp16 = (self.device == "cuda")
        result = self.model.transcribe(file_path, fp16=is_fp16)
        return result["text"].strip()
