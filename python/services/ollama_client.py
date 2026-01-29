import requests # type: ignore
from requests.adapters import HTTPAdapter # type: ignore
from urllib3.util.retry import Retry # type: ignore
import json
import sys

class OllamaClient:
    def __init__(self, base_url="http://localhost:11434"):
        self.base_url = base_url
        
        # Create session with connection pooling for better performance
        self.session = requests.Session()
        
        # Configure retry strategy
        retry_strategy = Retry(
            total=2,
            backoff_factor=0.5,
            status_forcelist=[500, 502, 503, 504]
        )
        adapter = HTTPAdapter(
            max_retries=retry_strategy,
            pool_connections=2,
            pool_maxsize=2
        )
        self.session.mount("http://", adapter)

    def generate(self, model, prompt, system_prompt=None, stream_callback=None):
        url = f"{self.base_url}/api/generate"
        
        # Optimized generation parameters
        data = {
            "model": model,
            "prompt": prompt,
            "stream": stream_callback is not None,  # Stream if callback provided
            "options": {
                "num_ctx": 2048,         # Reduced context for faster inference
                "num_predict": 256,      # Limit response length
                "temperature": 0.7,      # Slightly lower for faster convergence
                "top_k": 30,             # Reduced for speed
                "top_p": 0.85,           # Focused sampling
                "repeat_penalty": 1.1,   # Standard penalty
                "num_thread": 4          # Limit threads to prevent CPU overload
            }
        }
        
        if system_prompt:
            data["system"] = system_prompt

        try:
            if stream_callback:
                # Streaming mode for faster first-token
                response = self.session.post(url, json=data, stream=True, timeout=60)
                response.raise_for_status()
                
                full_response = ""
                for line in response.iter_lines():
                    if line:
                        chunk = json.loads(line)
                        token = chunk.get("response", "")
                        full_response += token
                        stream_callback(token)
                        if chunk.get("done", False):
                            break
                return full_response
            else:
                # Non-streaming mode
                response = self.session.post(url, json=data, timeout=90)
                response.raise_for_status()
                result = response.json()
                return result.get("response", "")
                
        except requests.exceptions.ConnectionError:
            print("Ollama Connection Error: Is Ollama running?", file=sys.stderr)
            return None
        except requests.exceptions.Timeout:
            print("Ollama request timed out", file=sys.stderr)
            return None
        except Exception as e:
            print(f"Ollama Error: {e}", file=sys.stderr)
            return None
    
    def __del__(self):
        # Clean up session on destruction
        if hasattr(self, 'session'):
            self.session.close()
