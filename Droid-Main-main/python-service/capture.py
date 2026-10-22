#!/usr/bin/env python
"""
Screen capture service: real frames from mss or PIL ImageGrab, or an honest failure.
Prints {"success": true, "imageData", "method", "metadata"} to stdout on success;
on failure prints {"success": false, "error"} to stderr and exits 1.
"""
import json
import base64
import struct
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from automation import capture_real_screen


def png_size(png: bytes) -> tuple:
    """Width and height from a PNG's IHDR chunk (no Pillow needed)."""
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Captured frame is not a PNG")
    return struct.unpack(">II", png[16:24])


def frame_metadata(width: int, height: int) -> dict:
    return {
        "pixels": {"width": width, "height": height},
        "viewport": {
            "pixels": {"width": width, "height": height},
            "css": {"width": width, "height": height},
            "devicePixelRatio": 1,
            "offset": {"x": 0, "y": 0},
        },
        "scale": {"x": 1, "y": 1},
        "offset": {"x": 0, "y": 0},
    }


def main():
    """Capture the real screen and return it as a base64 data URL."""
    try:
        image_data, method = capture_real_screen()
        width, height = png_size(base64.b64decode(image_data.split(",", 1)[-1]))
        print(json.dumps({
            "success": True,
            "imageData": image_data,
            "method": method,
            "metadata": frame_metadata(width, height),
        }))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
