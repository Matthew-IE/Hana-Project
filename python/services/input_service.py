import keyboard # type: ignore
import mouse # type: ignore
import threading
import sys
from services.protocol import send_message

class InputService:
    def __init__(self):
        self.current_bind = None
        self.target_key = None
        self.is_active = False 
        # Making sure threads play nice, or at least pretend to.
        self._lock = threading.Lock()
        self.on_press_callback = None
        self.on_release_callback = None

    def update_config(self, config):
        # Electron handles input now (Akari Architecture). 
        # We perform a cleanup just in case.
        self._unhook()
        return

    def _unhook(self):
        try:
            keyboard.unhook_all()
            mouse.unhook_all()
        except:
            # If this fails, the ghost in the machine has won.
            pass
        self.current_bind = None
        self.is_active = False

    def _hook(self):
        # Disabled for Electron Management
        pass

    def _on_input_down(self, event=None):
        try:
            if not self.is_active:
                self.is_active = True
                send_message("voice:start", {})
                if self.on_press_callback:
                    self.on_press_callback()
        except Exception as e:
            print(f"PTT Down Error: {e}", file=sys.stderr)

    def _on_input_up(self, event=None):
        try:
            if self.is_active:
                self.is_active = False
                send_message("voice:stop", {})
                if self.on_release_callback:
                    self.on_release_callback()
        except Exception as e:
            print(f"PTT Up Error: {e}", file=sys.stderr)

    # Removed old specific handlers in favor of generic _on_input_down/up that accept optional event arg

