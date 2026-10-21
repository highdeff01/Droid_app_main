#!/usr/bin/env python
"""
AI-powered mouse movement, click, and typing based on user input.
Uses Ollama-compatible LLM to determine actions, then executes them via automation module.
"""

import sys
import json
import os
import requests
import time

# Fix Unicode output for Windows
if sys.platform == "win32":
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())
    sys.stderr = codecs.getwriter("utf-8")(sys.stderr.detach())

# Add python-service to path for automation module
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from automation import (
    move_mouse,
    click_mouse,
    type_text,
    press_key,
    move_mouse_human,
    click_mouse_human,
    type_text_human,
    get_screen_size,
)

model = "qwen3.5:2b"
history_file = "conversation_history.json"
ollama_url = "https://quantumclaw.net/ollama/api/chat"


class LLM:
    def __init__(self):
        self.messages = self.load_history()
        # Add system prompt to instruct AI to return structured JSON actions
        if not any(m.get("role") == "system" for m in self.messages):
            self.messages.insert(0, {"role": "system", "content": (
                "You are an AI assistant that controls mouse and keyboard actions. "
                "Respond with STRICT JSON only (no prose, no markdown, no backticks). "
                "Use this exact format for actions: "
                '{"action": "click", "x": 960, "y": 540, "reason": "your reason here"} '
                '{"action": "type_text", "x": 500, "y": 500, "text": "your text here"} '
                '{"action": "move_mouse", "x": 960, "y": 540} '
                '{"action": "press_key", "key": "enter"} '
                '{"action": "wait", "delayMs": 500} '
                '{"action": "right_click", "x": 960, "y": 540} '
                '{"action": "double_click", "x": 960, "y": 540} '
                '{"action": "scroll", "direction": "up", "clicks": 3} '
                "Always include relevant x, y coordinates (use 960, 540 for center screen if unspecified). "
                "The user will physically execute your actions on their desktop."
            )})
        # Keep history trimmed to prevent token bloat
        if len(self.messages) > 15:
            # Keep system + last 12 messages (6 exchanges)
            self.messages = [self.messages[0]] + self.messages[-12:]

    def get_ai_response(self, user_message):
        self.messages.append({"role": "user", "content": user_message})
        body = {
            "model": model,
            "messages": self.messages,
            "stream": False,
        }

        try:
            response = requests.post(ollama_url, json=body)
            response.raise_for_status()

            data = response.json()
            full_content = data["message"]["content"]

            self.messages.append({"role": "assistant", "content": full_content})
            self.save_history()

            return full_content
        except requests.exceptions.RequestException as e:
            print(f"An error occurred while making the request: {e}")
        except json.JSONDecodeError as e:
            print(f"An error occurred while decoding the response: {e}")
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
        return None

    def save_history(self):
        try:
            with open(history_file, 'w') as f:
                json.dump(self.messages, f)
        except Exception as e:
            print(f"An error occurred while saving the conversation history: {e}")

    def load_history(self):
        try:
            if os.path.exists(history_file):
                with open(history_file, 'r') as f:
                    return json.load(f)
            else:
                return []
        except Exception as e:
            print(f"An error occurred while loading the conversation history: {e}")
            return []


def parse_ai_action(ai_response):
    """
    Parse AI response to extract action directives.
    Expects JSON like: {"action": "click", "x": 960, "y": 540, "reason": "..."}
    Or: {"action": "type_text", "x": 500, "y": 500, "text": "hello"}
    Also handles: [[{"action": "move_mouse", ...}, {"action": "click", ...}]] (array format)
    """
    try:
        response_text = ai_response.strip()

        # 1. Try direct JSON parse first
        try:
            parsed = json.loads(response_text)
            if isinstance(parsed, dict) and "action" in parsed:
                return parsed
            if isinstance(parsed, list) and len(parsed) > 0:
                # It's a list - return first item if it has 'action'
                first = parsed[0]
                if isinstance(first, dict) and "action" in first:
                    return first
        except json.JSONDecodeError:
            pass

        # 2. Try to extract JSON object from text (single { ... })
        start = response_text.find('{')
        end = response_text.rfind('}')
        if start >= 0 and end > start:
            json_str = response_text[start:end + 1]
            try:
                parsed = json.loads(json_str)
                if isinstance(parsed, dict) and "action" in parsed:
                    return parsed
                # Also check if it's an array in JSON format
                if isinstance(parsed, list) and len(parsed) > 0:
                    first = parsed[0]
                    if isinstance(first, dict) and "action" in first:
                        return first
            except json.JSONDecodeError:
                pass

        # 3. Try to find JSON array format [[...]] in the text
        # Look for pattern: [{"action": ..., ...}, {"action": ..., ...}]
        import re
        # Find all { ... } blocks that look like JSON objects
        json_blocks = re.findall(r'\{[^}]+\}', response_text)
        for block in json_blocks:
            try:
                parsed = json.loads(block)
                if isinstance(parsed, dict) and "action" in parsed:
                    return parsed
            except json.JSONDecodeError:
                continue

        # 4. Check if entire response is a JSON array like [{"action":...}, ...]
        # by trying to find the outer brackets
        if response_text.startswith('[') and response_text.rfind(']') > 0:
            array_end = response_text.rfind(']')
            array_str = response_text[:array_end + 1]
            try:
                parsed = json.loads(array_str)
                if isinstance(parsed, list) and len(parsed) > 0:
                    first = parsed[0]
                    if isinstance(first, dict) and "action" in first:
                        return first
            except json.JSONDecodeError:
                pass

        return None
    except Exception:
        return None


def execute_action(action_data):
    """
    Execute a mouse/keyboard action based on parsed AI response data.
    Expected fields: action, x, y, text (optional), reason (optional)
    """
    if not action_data:
        print("No valid action data received from AI")
        return False

    action = str(action_data.get("action", "")).lower().strip()
    x = action_data.get("x", 960)
    y = action_data.get("y", 540)
    text = action_data.get("text", "")

    # Ensure coordinates are integers
    try:
        x = int(x)
        y = int(y)
    except (ValueError, TypeError):
        x = 960
        y = 540

    reason = action_data.get("reason", "AI-directed action")

    print(f"AI action: {action} at ({x}, {y}) - {reason}")

    try:
        if action in ["click", "left_click"]:
            click_mouse_human(x, y, dwell_ms=120)
            print("  -> Mouse clicked human-style")

        elif action in ["right_click"]:
            click_mouse(x, y, button="right")
            print("  -> Right mouse clicked")

        elif action in ["double_click"]:
            double_click(x, y)
            print("  -> Double mouse clicked")

        elif action in ["type_text", "type"]:
            if text:
                click_mouse_human(x, y, dwell_ms=120)
                time.sleep(0.2)
                type_text_human(text, base_delay_ms=65, jitter_ms=35)
                print(f"  -> Typed: '{text}'")
            else:
                print("  -> type_text action but no text provided")

        elif action in ["move_mouse"]:
            move_mouse_human(x, y)
            print("  -> Mouse moved human-style")

        elif action in ["press_key"]:
            key = action_data.get("key", "enter")
            press_key(key)
            print(f"  -> Pressed key: {key}")

        elif action in ["hotkey"]:
            keys = action_data.get("keys", ["ctrl", "c"]).split("+")
            hotkey(*keys)
            print(f"  -> Hotkey: {'+'.join(keys)}")

        elif action in ["wait", "sleep"]:
            ms = action_data.get("delayMs", 500)
            try:
                ms = int(ms)
            except (ValueError, TypeError):
                ms = 500
            time.sleep(max(0, ms) / 1000.0)
            print(f"  -> Waited {ms}ms")

        elif action in ["scroll"]:
            direction = action_data.get("direction", "down")
            clicks = action_data.get("clicks", 5)
            if direction.lower() in ["up", "positive"]:
                scroll(clicks, x, y, "up")
            else:
                scroll(clicks, x, y, "down")
            print(f"  -> Scrolled {'up' if direction.lower() in ['up', 'positive'] else 'down'}")

        else:
            # Default: click at coordinates
            click_mouse_human(x, y, dwell_ms=120)
            print(f"  -> Default click at ({x}, {y})")

        return True

    except Exception as e:
        print(f"  -> Error executing action: {e}")
        return False


def main():
    try:
        llm = LLM()
        print("AI-powered Mouse/Keyboard Controller")
        print("=" * 50)
        print("You can start chatting with the AI. Type 'quit' to exit.")
        print("Press Ctrl+C to exit at any time.")
        print()

        while True:
            try:
                user_message = input("You: ")
                if user_message.lower() == 'quit':
                    break
                if not user_message.strip():
                    continue

                response = llm.get_ai_response(user_message)
                if not response:
                    print("Failed to get response from AI.")
                    continue

                print("AI:", response)
                print()

                # Try to parse action from AI response
                action_data = parse_ai_action(response)

                if action_data:
                    print("Executing AI-directed action...")
                    success = execute_action(action_data)
                    if not success:
                        print("Failed to execute action.")
                else:
                    # No structured action found, just display the response
                    print("(No specific action detected in AI response)")
                    # Check if response contains action hints
                    lower_resp = response.lower()
                    if "click" in lower_resp and "(" in lower_resp:
                        print("  -> Response mentions clicking, but no structured action found")
                    if "type" in lower_resp and "text" in lower_resp:
                        print("  -> Response mentions typing, but no structured action found")

            except KeyboardInterrupt:
                print("\nGoodbye!")
                break
            except EOFError:
                print("\nInput ended. Goodbye!")
                break

    except KeyboardInterrupt:
        print("\nGoodbye!")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
    finally:
        print("Chat session ended.")


if __name__ == "__main__":
    main()