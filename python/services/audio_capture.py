import sounddevice as sd # type: ignore
import numpy as np # type: ignore
import threading
import queue
import sys

class AudioCapture:
    def __init__(self, sample_rate=16000, channels=1):
        self.sample_rate = sample_rate
        self.channels = channels
        self.recording = False
        self.stream_running = False
        self.audio_queue = queue.Queue(maxsize=500)  # Limit queue size
        self.stream = None
        self.device_index = None
        
        # Silence detection thresholds
        self.silence_threshold = 0.01  # RMS threshold for silence
        self.min_speech_frames = 5     # Minimum frames to consider as speech
        self.consecutive_silence = 0
        self.speech_detected = False
        
        # Attempt to start stream on default device
        try:
            self._start_stream()
        except:
            pass

    def set_device(self, device_index):
        if self.device_index == device_index and self.stream_running:
            return  # No change
             
        # print(f"Setting audio device to index: {device_index}", file=sys.stderr)
        self.device_index = device_index
        self._start_stream()

    def _start_stream(self):
        # Stop existing if any
        if self.stream:
            try:
                self.stream.stop()
                self.stream.close()
            except:
                pass
            self.stream = None
            self.stream_running = False

        def callback(indata, frames, time, status):
            if not self.recording:
                return
                
            # Quick RMS calculation for silence detection
            rms = np.sqrt(np.mean(indata ** 2))
            
            if rms > self.silence_threshold:
                self.speech_detected = True
                self.consecutive_silence = 0
                try:
                    self.audio_queue.put_nowait(indata.copy())
                except queue.Full:
                    pass  # Drop frame if queue is full
            elif self.speech_detected:
                # Still capture some silence after speech for natural ending
                self.consecutive_silence += 1
                if self.consecutive_silence < 15:  # ~0.5s of trailing silence
                    try:
                        self.audio_queue.put_nowait(indata.copy())
                    except queue.Full:
                        pass

        try:
            self.stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=self.channels,
                callback=callback,
                dtype='float32',
                device=self.device_index,
                blocksize=512,      # Smaller blocks for lower latency
                latency='low'       # Request low latency
            )
            self.stream.start()
            self.stream_running = True
        except Exception as e:
            print(f"Failed to initialize audio stream: {e}", file=sys.stderr)
            self.stream_running = False

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
            
        # If stream isn't running, try to restart it
        if not self.stream_running:
            self._start_stream()
            if not self.stream_running:
                return

        # Clear queue efficiently
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
            except queue.Empty:
                break
        
        # Reset silence detection state
        self.speech_detected = False
        self.consecutive_silence = 0
        self.recording = True

    def stop_capture(self):
        """Immediately stops the recording flag."""
        self.recording = False

    def get_captured_audio(self):
        """Retrieves and concatenates audio data. Call this after stop_capture()."""
        data_blocks = []
        try:
            while not self.audio_queue.empty():
                data_blocks.append(self.audio_queue.get_nowait())
        except queue.Empty:
            pass
        
        if not data_blocks:
            return None
        
        # Efficient concatenation
        return np.concatenate(data_blocks, axis=0).flatten()

    def stop(self):
        if not self.recording:
            return None
        
        self.stop_capture()
        return self.get_captured_audio()

