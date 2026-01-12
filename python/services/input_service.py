import keyboard
import mouse
import threading
import sys
from services.protocol import send_message

class InputService:
    def __init__(self):
        self.current_bind = None
        self.is_active = False 
        # Making sure threads play nice, or at least pretend to.
        self._lock = threading.Lock()
        self.on_press_callback = None
        self.on_release_callback = None

    def update_config(self, config):
        # We only care about PTT config
        if not config.get("voiceEnabled", False):
            self._unhook()
            return

        if not config.get("pushToTalk", False):
            self._unhook()
            return

        bind_key = config.get("pushToTalkKey")
        if not bind_key:
            self._unhook()
            return
            
        with self._lock:
            if self.current_bind == bind_key:
                return
            
            self._unhook()
            self.current_bind = bind_key
            self._hook()

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
        if not self.current_bind:
            return

        key = self.current_bind
        
        # Clean up key name if needed
        # Frontend might send "Mouse 0" or "v"
        
        if key.startswith("Mouse"):
            # Map DOM button indices to `mouse` library names
            # DOM: 0=Left, 1=Middle, 2=Right, 3=Back (Browser Back), 4=Forward
            # Mouse Lib: left, right, middle, x, x2
            # I found this mapping on a napkin in a Denny's parking lot
            btn_map = {
                "Mouse0": "left",
                "Mouse1": "middle",  
                "Mouse2": "right", 
                "Mouse3": "x", 
                "Mouse4": "x2"
            }
            btn = btn_map.get(key)
            if btn:
                try:
                    # mouse.on_button does not pass the event to the callback
                    # So we register separate handlers for DOWN and UP
                    mouse.on_button(
                        callback=self._on_input_down, 
                        buttons=[btn], 
                        types=[mouse.DOWN]
                    )
                    mouse.on_button(
                        callback=self._on_input_up, 
                        buttons=[btn], 
                        types=[mouse.UP]
                    )
                    print(f"DEBUG: Hooked Mouse {btn}", file=sys.stderr)
                except Exception as e:
                    send_message("error", {"text": f"Mouse Hook Error: {e}"})
        else:
            # Keyboard
            # Normalize key name for `keyboard` library
            # JS sends "KeyV", "Space", "ControlLeft", "ShiftRight", etc.
            # Python keyboard expects "v", "space", "left control" (maybe), "shift"
            # Why can't we just agree on key names?
            
            norm_key = key.lower()
            if norm_key.startswith("key"):
                norm_key = norm_key[3:] # KeyV -> v
            
            # Map special keys if needed
            key_map = {
                "space": "space",
                "controlleft": "left control",
                "controlright": "right control",
                "shiftleft": "left shift",
                "shiftright": "right shift",
                "altleft": "left alt",
                "altright": "right alt",
                "escape": "esc",
                "enter": "enter",
                "backspace": "backspace",
                "tab": "tab"
            }
            
            if norm_key in key_map:
                norm_key = key_map[norm_key]
                
            try:
                # suppress=False ensures we don't block the key from other apps
                keyboard.on_press_key(norm_key, self._on_input_down, suppress=False)
                keyboard.on_release_key(norm_key, self._on_input_up, suppress=False)
                print(f"DEBUG: Hooked Keyboard {norm_key} (from {key})", file=sys.stderr)
            except Exception as e:
                send_message("error", {"text": f"Key Hook Error ({key}->{norm_key}): {e}"})

    def _on_input_down(self, event=None):
        if not self.is_active:
            self.is_active = True
            # print(f"DEBUG PTT START", file=sys.stderr)
            send_message("voice:start", {})
            if self.on_press_callback:
                try:
                    self.on_press_callback()
                except Exception as e:
                    print(f"Error in on_press_callback: {e}", file=sys.stderr)

    def _on_input_up(self, event=None):
        if self.is_active:
            self.is_active = False
            # print(f"DEBUG PTT STOP", file=sys.stderr)
            send_message("voice:stop", {})
            if self.on_release_callback:
                try:
                    self.on_release_callback()
                except Exception as e:
                    print(f"Error in on_release_callback: {e}", file=sys.stderr)

    # Removed old specific handlers in favor of generic _on_input_down/up that accept optional event arg

