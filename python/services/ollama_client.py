import requests # type: ignore
import json
import sys

class OllamaClient:
    def __init__(self, base_url="http://localhost:11434"):
        self.base_url = base_url

    def generate(self, model, prompt, system_prompt=None):
        url = f"{self.base_url}/api/generate"
        
        data = {
            "model": model,
            "prompt": prompt,
            "stream": False # For now, simple non-streaming
        }
        
        if system_prompt:
            data["system"] = system_prompt

        try:
            print(f"Sending request to Ollama ({model})...", file=sys.stderr)
            # Add timeout to avoid infinite hanging if server is weird, but large enough for generation
            response = requests.post(url, json=data, timeout=120) 
            response.raise_for_status()
            result = response.json()
            return result.get("response", "")
        except requests.exceptions.ConnectionError:
            print("Ollama Connection Error: Is Ollama running? (ollama serve)", file=sys.stderr)
            return None
        except Exception as e:
            print(f"Ollama Error: {e}", file=sys.stderr)
            return None
