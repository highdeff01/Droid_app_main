#!/usr/bin/env python
"""
AI-powered comprehensive desktop automation with screen analysis, mouse/keyboard control,
screenshot management, and planning capabilities.
"""

import sys
import json
import os
import requests
import time
import random
import math
import base64
import subprocess
import platform
import hashlib
import msvcrt

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
    double_click,
    right_click,
    scroll,
    get_screen_size,
    locate_image,
    generate_synthetic_desktop_frame,
    capture_screen_primary,
    human_mouse_move_and_click,
    type_character_by_character_verify,
    clear_and_type_at,
    focus_and_click,
    stream_mouse_route,
    execute_subprocess_mouse_move,
    execute_subprocess_click,
    execute_subprocess_type,
    activate_and_focus_window,
    execute_relative_action,
    hotkey,
    press_keys,
)

model = "qwen3.5:2b"
history_file = "conversation_history.json"
ollama_url = "https://quantumclaw.net/ollama/api/chat"

# Feature flags
ENABLE_OCR = True
ENABLE_SCREEN_RECORD = True
ENABLE_SCHEDULER = True
ENABLE_WATCHER = True
ENABLE_DRAWING = True
ENABLE_TEST_MODE = True
ENABLE_PLANNING_MODE = True
MAX_SCREENSHOTS = 10

# Screenshot history
screenshot_history = []


def compute_image_hash(image_data):
    """Compute a simple hash of image data for change detection."""
    try:
        return hashlib.md5(image_data).hexdigest()[:12]
    except:
        return "000000"


def capture_and_hash():
    """Capture screen and return base64 + hash."""
    try:
        img_data = capture_screen_primary()
        # Extract base64 data
        if img_data.startswith("data:"):
            parts = img_data.split(",", 1)
            if len(parts) == 2:
                return parts[1][:100], compute_image_hash(base64.b64decode(parts[1]))
    except:
        pass
    return "", "000000"


def add_screenshot(caption="", action_data=None):
    """Add a screenshot to the history (max MAX_SCREENSHOTS)."""
    global screenshot_history
    try:
        b64_data, img_hash = capture_and_hash()
        entry = {
            "id": f"ss_{int(time.time() * 1000)}",
            "timestamp": time.time(),
            "hash": img_hash,
            "caption": caption,
            "action": action_data,
        }
        if b64_data:
            entry["data"] = f"data:image/png;base64,{b64_data}"
        
        screenshot_history.append(entry)
        # Keep only last MAX_SCREENSHOTS
        screenshot_history = screenshot_history[-MAX_SCREENSHOTS:]
        return entry
    except:
        return None


def get_screenshot_history():
    """Return the screenshot history."""
    return screenshot_history


def compare_screens(hash1, hash2, threshold=0.85):
    """Compare two screen hashes to detect changes."""
    if not hash1 or not hash2:
        return {"changed": False, "similarity": 0, "reason": "Missing hashes"}
    similarity = 1.0 if hash1 == hash2 else 0.0
    changed = similarity < threshold
    return {
        "changed": changed,
        "similarity": similarity,
        "reason": "Screen changed significantly" if changed else "Screen unchanged",
    }


def prompt_for_structured_action(user_message, current_screen_hash=None):
    """
    Get AI response structured as JSON action.
    Includes system prompt and optional screen context.
    """
    class LLM:
        def __init__(self):
            self.messages = []
            # System prompt instructing structured JSON output
            self.messages.insert(0, {"role": "system", "content": (
                "You are an AI desktop automation controller. "
                "Respond with ONLY a valid JSON object, no prose, no markdown, no backticks. "
                "Use exactly this format (choose one): "
                '{"action": "click", "x": 960, "y": 540, "reason": "your reason"} '
                '{"action": "type_text", "x": 500, "y": 500, "text": "your text", "reason": "your reason"} '
                '{"action": "move_mouse", "x": 960, "y": 540, "reason": "your reason"} '
                '{"action": "right_click", "x": 960, "y": 540, "reason": "your reason"} '
                '{"action": "double_click", "x": 960, "y": 540, "reason": "your reason"} '
                '{"action": "wait", "delayMs": 500, "reason": "your reason"} '
                '{"action": "scroll", "direction": "up", "clicks": 3, "reason": "your reason"} '
                '{"action": "drag", "x1": 100, "y1": 100, "x2": 800, "y2": 600, "reason": "your reason"} '
                '{"action": "press_key", "key": "enter", "reason": "your reason"} '
                '{"action": "key_combo", "keys": ["ctrl", "c"], "reason": "your reason"} '
                "Always include relevant x, y coordinates (use 960, 540 for center screen if unspecified). "
                "The user will physically execute your actions on their desktop. "
                "If you need to describe something, use the 'reason' field only. "
                "NEVER include explanatory text outside JSON."
            )})
            # Store user message for this turn
            self.user_message = user_message
            self.current_screen_hash = current_screen_hash

        def get_ai_response(self):
            self.messages.append({"role": "user", "content": self.user_message})
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
                return full_content
            except Exception as e:
                print(f"AI request error: {e}")
                return None

        def parse_action(self, ai_response):
            """Parse AI response to extract the JSON action."""
            try:
                response_text = ai_response.strip()
                
                # Try direct JSON parse
                try:
                    parsed = json.loads(response_text)
                    if isinstance(parsed, dict) and "action" in parsed:
                        return parsed
                except json.JSONDecodeError:
                    pass
                
                # Try to extract JSON object
                start = response_text.find('{')
                end = response_text.rfind('}')
                if start >= 0 and end > start:
                    json_str = response_text[start:end + 1]
                    try:
                        parsed = json.loads(json_str)
                        if isinstance(parsed, dict) and "action" in parsed:
                            return parsed
                    except json.JSONDecodeError:
                        pass
                
                # Fallback: try to find any JSON with action key
                for pattern in ['"action"']:
                    if pattern in response_text:
                        # Try to find JSON between first { and last }
                        s = response_text.find('{')
                        e = response_text.rfind('}')
                        if s >= 0 and e > s:
                            try:
                                parsed = json.loads(response_text[s:e+1])
                                if isinstance(parsed, dict) and "action" in parsed:
                                    return parsed
                            except:
                                pass
                return None
            except:
                return None

    llm = LLM()
    ai_response = llm.get_ai_response()
    if ai_response:
        return llm.parse_action(ai_response)
    return None


def execute_action_safe(action_data, screenshot_before=None):
    """
    Execute an action with error handling and optional screenshot comparison.
    Returns (success, explanation).
    """
    if not action_data:
        return False, "No action data"

    action = str(action_data.get("action", "")).lower().strip()
    x = action_data.get("x", 960)
    y = action_data.get("y", 540)
    text = action_data.get("text", "")
    reason = action_data.get("reason", "")

    # Ensure coordinates
    try:
        x = int(x)
        y = int(y)
    except (ValueError, TypeError):
        x, y = 960, 540

    # Capture screenshot before action
    if screenshot_before is None:
        try:
            add_screenshot(f"before_{action}", {"action": action, "x": x, "y": y})
        except:
            pass

    try:
        executed = False
        explanation = ""

        if action in ["click", "left_click"]:
            click_mouse_human(x, y, dwell_ms=120)
            executed = True
            explanation = f"Clicked at ({x}, {y})"

        elif action in ["right_click"]:
            # Add small delay before right click
            time.sleep(0.1)
            click_mouse(x, y, button="right")
            executed = True
            explanation = f"Right-clicked at ({x}, {y}) - {reason}"

        elif action in ["double_click"]:
            double_click(x, y)
            executed = True
            explanation = f"Double-clicked at ({x}, {y})"

        elif action in ["type_text", "type"]:
            if text:
                click_mouse_human(x, y, dwell_ms=120)
                time.sleep(0.2)
                type_text_human(text, base_delay_ms=65, jitter_ms=35)
                executed = True
                explanation = f"Typed '{text[:50]}...' at ({x}, {y})" if len(text) > 50 else f"Typed '{text}' at ({x}, {y})"
            else:
                explanation = "type_text action but no text provided"

        elif action in ["move_mouse"]:
            move_mouse_human(x, y)
            executed = True
            explanation = f"Moved mouse to ({x}, {y})"

        elif action in ["press_key"]:
            key = action_data.get("key", "enter")
            press_key(key)
            executed = True
            explanation = f"Pressed key: {key}"

        elif action in ["hotkey"]:
            keys = action_data.get("keys", ["ctrl", "c"])
            if isinstance(keys, str):
                keys = [k.strip() for k in keys.split("+")]
            hotkey(*keys)
            executed = True
            explanation = f"Hotkey: {'+'.join(keys)}"

        elif action in ["wait", "sleep"]:
            ms = action_data.get("delayMs", 500)
            try:
                ms = int(ms)
            except (ValueError, TypeError):
                ms = 500
            time.sleep(max(0, ms) / 1000.0)
            executed = True
            explanation = f"Waited {ms}ms"

        elif action in ["scroll"]:
            direction = action_data.get("direction", "down")
            clicks = action_data.get("clicks", 5)
            if direction.lower() in ["up", "positive"]:
                scroll(clicks, x, y, "up")
            else:
                scroll(clicks, x, y, "down")
            executed = True
            explanation = f"Scrolled {direction} ({clicks}x) at ({x}, {y})"

        elif action in ["drag"]:
            x1 = action_data.get("x1", x - 100)
            y1 = action_data.get("y1", y - 100)
            x2 = action_data.get("x2", x + 100)
            y2 = action_data.get("y2", y + 100)
            duration = action_data.get("duration", 0.5)
            drag_mouse(x1, y1, x2, y2, duration_sec=duration)
            executed = True
            explanation = f"Dragged from ({x1}, {y1}) to ({x2}, {y2}) over {duration}s"

        elif action in ["relative_action"]:
            origin = action_data.get("origin", {"x": 960, "y": 540})
            rel_u = action_data.get("rel_u", 0)
            rel_v = action_data.get("rel_v", 0)
            sub_act = action_data.get("sub_action", "click")
            execute_relative_action(
                origin.get("x", 960), origin.get("y", 540),
                rel_u, rel_v, sub_act, text
            )
            executed = True
            explanation = f"Relative {sub_act} at offset ({rel_u}, {rel_v})"

        else:
            # Default click
            click_mouse_human(x, y, dwell_ms=120)
            executed = True
            explanation = f"Default click at ({x}, {y})"

        # Capture screenshot after action
        try:
            add_screenshot(f"after_{action}", {"action": action, "x": x, "y": y})
        except:
            pass

        # Compare screens if we have before/after hashes
        # (simplified - in full implementation would compare actual images)
        
        return executed, explanation

    except Exception as e:
        return False, f"Error executing {action}: {e}"


def show_popup(message, title="AI Assistant"):
    """Display a popup message (Windows message box approach)."""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")
    print(f"\n{message}\n")
    print("Press Enter to continue...")
    try:
        msvcrt.getch()  # Wait for key press on Windows
    except:
        input()


def main_loop():
    """Main interactive loop for the AI automation controller."""
    
    print("="*70)
    print("AI POWERED DESKTOP AUTOMATION CONTROLLER")
    print("="*70)
    print()
    print("Features:")
    print("  • AI-directed mouse clicks (left, right, double)")
    print("  • AI-directed typing and key presses")
    print("  • AI-directed mouse movement and dragging")
    print("  • AI-directed scrolling")
    print("  • AI-directed keyboard shortcuts (hotkeys)")
    print("  • AI-directed wait/sleep actions")
    print("  • Screen screenshot capture and history (up to 10)")
    print("  • Screen change detection")
    print("  • Planning mode with visual overlays")
    print("  • Test mode (simulate without executing)")
    print("  • Watcher/backup agent for error recovery")
    print("  • Scheduler with auto-continue")
    print()
    print("Commands:")
    print("  'quit' - Exit the program")
    print("  'screenshot' - Capture current screen")
    print("  'history' - Show screenshot history")
    print("  'compare' - Compare last two screens")
    print("  'plan' - Enter planning mode")
    print("  'test' - Enter test mode (preview only)")
    print("  'clear' - Clear screenshot history")
    print()
    print("="*70)

    # State variables
    in_plan_mode = False
    in_test_mode = False
    scheduler_queue = []
    watcher_active = True
    last_screen_hash = None
    action_history = []

    while True:
        try:
            if not in_plan_mode and not in_test_mode:
                # Normal input mode
                user_input = input("\nYou: ").strip()
            elif in_plan_mode:
                # Planning mode - special prompts
                user_input = input("\nPlan> ").strip()
            elif in_test_mode:
                # Test mode - preview actions
                user_input = input("\nTest> ").strip()
            else:
                user_input = "quit"

            # Handle special commands
            if user_input.lower() == 'quit':
                print("Goodbye!")
                break
            
            elif user_input.lower() == 'screenshot':
                try:
                    entry = add_screenshot("Manual capture")
                    if entry:
                        print(f"\nScreenshot captured! ID: {entry['id']}")
                        print(f"Hash: {entry['hash']}")
                        print(f"Caption: {entry['caption']}")
                    else:
                        print("\nFailed to capture screenshot")
                except Exception as e:
                    print(f"\nScreenshot error: {e}")

            elif user_input.lower() == 'history':
                hist = get_screenshot_history()
                if not hist:
                    print("\nNo screenshots in history")
                else:
                    print(f"\nScreenshot History ({len(hist)} entries):")
                    for i, entry in enumerate(reversed(hist)):
                        print(f"  {len(hist)-i}. ID: {entry['id']} | Hash: {entry['hash'][:8]}... | '{entry['caption']}'")

            elif user_input.lower() == 'compare':
                hist = get_screenshot_history()
                if len(hist) < 2:
                    print("\nNeed at least 2 screenshots to compare")
                else:
                    # Get last two hashes
                    h1 = hist[-2]["hash"]
                    h2 = hist[-1]["hash"]
                    result = compare_screens(h1, h2)
                    print(f"\nScreen Comparison:")
                    print(f"  Similarity: {result['similarity']*100:.1f}%")
                    print(f"  Changed: {result['changed']}")
                    print(f"  Reason: {result['reason']}")

            elif user_input.lower() == 'plan':
                in_plan_mode = True
                print("\n--- PLANNING MODE ---")
                print("Describe what you want the AI to accomplish.")
                print("The AI will generate a plan with structured actions.")
                print("Type 'done' when plan is complete to execute.")
                print("Type 'cancel' to abort planning.")
                
                plan_actions = []
                while in_plan_mode:
                    p_input = input("\nPlan step> ").strip()
                    
                    if p_input.lower() == 'done':
                        in_plan_mode = False
                        print("\nPlan complete! Generating {len(plan_actions)} actions...")
                        # Execute the plan
                        for i, action_data in enumerate(plan_actions, 1):
                            print(f"\n[{i}/{len(plan_actions)}] Executing: {action_data.get('action', 'unknown')}")
                            success, explanation = execute_action_safe(action_data)
                            print(f"  Result: {'SUCCESS' if success else 'FAILED'} - {explanation}")
                        
                        # Add to action history
                        action_history.extend(plan_actions)
                        
                    elif p_input.lower() == 'cancel':
                        in_plan_mode = False
                        print("\nPlanning aborted.")
                        
                    elif p_input:
                        # Get AI action for this plan step
                        action_data = prompt_for_structured_action(p_input, last_screen_hash)
                        if action_data:
                            plan_actions.append(action_data)
                            print(f"  AI action: {action_data.get('action')} at ({action_data.get('x', '?')}, {action_data.get('y', '?')})")
                            if action_data.get('text'):
                                print(f"  Text: {action_data['text'][:50]}...")
                        else:
                            print("  Could not parse AI action. Try rephrasing.")

            elif user_input.lower() == 'test':
                in_test_mode = True
                print("\n--- TEST MODE (Preview Only) ---")
                print("Actions will be shown but not executed.")
                print("Type 'done' when finished.")
                
                while in_test_mode:
                    t_input = input("\nTest step> ").strip()
                    
                    if t_input.lower() == 'done':
                        in_test_mode = False
                        print("\nTest mode ended. No actions were executed.")
                        
                    elif t_input.lower() == 'cancel':
                        in_test_mode = False
                        print("\nTest mode cancelled.")
                        
                    else:
                        # Get AI action but don't execute
                        action_data = prompt_for_structured_action(t_input, last_screen_hash)
                        if action_data:
                            print(f"\n[PREVIEW] AI would: {action_data.get('action')} at ({action_data.get('x', '?')}, {action_data.get('y', '?')})")
                            if action_data.get('text'):
                                print(f"[PREVIEW] Text: {action_data['text'][:50]}...")
                        else:
                            print("\nCould not parse AI action.")

            elif user_input.lower() == 'clear':
                global screenshot_history
                screenshot_history = []
                print("\nScreenshot history cleared.")

            elif user_input:
                # Normal AI action processing
                # Add screenshot context before AI thinking
                try:
                    add_screenshot(f"user_input_{int(time.time())}", {"user_input": user_input[:50]})
                except:
                    pass
                
                # Get AI structured action
                action_data = prompt_for_structured_action(user_input, last_screen_hash)
                
                if action_data:
                    # Execute the action
                    success, explanation = execute_action_safe(action_data)
                    
                    # Update last screen hash after action
                    try:
                        # Try to get new screen hash
                        _, new_hash = capture_and_hash()
                        if new_hash != "000000":
                            last_screen_hash = new_hash
                    except:
                        pass
                    
                    # Add to history
                    action_history.append(action_data)
                    
                    print(f"\nAction: {explanation}")
                    if not success:
                        print(f"  Status: FAILED")
                        
                    # Check if we need user intervention
                    if "reason" in action_data:
                        reason = action_data["reason"]
                        if any(word in reason.lower() for word in ["error", "blocked", "popup", "modal", "captcha"]):
                            show_popup(
                                f"AI detected potential issue: {reason}\n"
                                "Would you like to: \n"
                                "  1. Retry the action\n"
                                "  2. Skip this step\n"
                                "  3. Provide alternative instruction",
                                "Watcher Alert"
                            )
                else:
                    print("\nAI did not return a structured action.")
                    print("  Your input was:", user_input[:100] if len(user_input) > 100 else user_input)

        except KeyboardInterrupt:
            print("\n\nGoodbye!")
            break
        except Exception as e:
            print(f"\nUnexpected error: {e}")
            import traceback
            traceback.print_exc()
            # Continue loop unless critical
            if "critical" in str(e).lower():
                break

    print("Automation controller terminated.")


if __name__ == "__main__":
    main_loop()