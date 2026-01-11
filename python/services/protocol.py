import json
import sys

def send_message(msg_type, payload):
    """Send a strictly formatted JSON message to stdout."""
    message = {
        "type": msg_type,
        "payload": payload
    }
    print(json.dumps(message), flush=True)

def parse_message(line):
    """Parse a JSON message from stdin."""
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        return None
