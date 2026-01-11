import sounddevice as sd # type: ignore
import numpy as np
import threading
import queue
import sys

class AudioCapture:
    def __init__(self, sample_rate=16000, channels=1):
        self.sample_rate = sample_rate
        self.channels = channels
        self.recording = False
        self.audio_queue = queue.Queue()
        self.stream = None
        self.device_index = None

    def set_device(self, device_index):
        print(f"Setting audio device to index: {device_index}", file=sys.stderr)
        self.device_index = device_index

    def list_devices(self):
        devices = []
        try:
            # query_devices returns a list of dictionaries
            device_list = sd.query_devices()
            for i, dev in enumerate(device_list):
                # Filter for input devices (max_input_channels > 0)
                if dev['max_input_channels'] > 0:
                    devices.append({
                        "index": i,
                        "name": dev['name'],
                        "hostapi": dev['hostapi']
                    })
        except Exception as e:
            print(f"Error listing devices: {e}", file=sys.stderr)
        return devices

    def start(self):
        if self.recording:
            return
            
        # Log devices just before starting to debug
        try:
             # print(sd.query_devices(), file=sys.stderr) # Uncomment to see all devices
             if self.device_index is not None:
                print(f"Starting stream on device index: {self.device_index}", file=sys.stderr)
             else:
                default_device = sd.query_devices(kind='input')
                print(f"Using Default Audio Device: {default_device['name']}", file=sys.stderr)
        except Exception as e:
             print(f"Could not query audio devices: {e}", file=sys.stderr)

        self.recording = True
        self.audio_queue = queue.Queue() # Clear queue
        
        def callback(indata, frames, time, status):
            if status:
                print(f"Audio status: {status}", file=sys.stderr)
            if self.recording:
                self.audio_queue.put(indata.copy())

        try:
            self.stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=self.channels,
                callback=callback,
                dtype='float32',
                device=self.device_index # Pass the selected device index (None = default)
            )
            self.stream.start()
        except Exception as e:
            print(f"Failed to start audio stream: {e}", file=sys.stderr)
            self.recording = False
            raise e

    def stop(self):
        if not self.recording:
            return None
        
        self.recording = False
        if self.stream:
            self.stream.stop()
            self.stream.close()
            self.stream = None

        # Collect all data from queue
        data_blocks = []
        while not self.audio_queue.empty():
            data_blocks.append(self.audio_queue.get())
        
        if not data_blocks:
            return None
            
        full_audio = np.concatenate(data_blocks, axis=0)
        return full_audio
