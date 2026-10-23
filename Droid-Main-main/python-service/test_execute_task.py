import importlib.util
import io
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

_PATH = Path(__file__).parent / "execute-task.py"
_spec = importlib.util.spec_from_file_location("execute_task", _PATH)
execute_task = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(execute_task)


def run(payload):
    """Run main() on a JSON payload and return the parsed JSON it prints."""
    out = io.StringIO()
    with mock.patch.object(sys, "stdin", io.StringIO(json.dumps(payload))), \
            mock.patch.object(sys, "stdout", out):
        execute_task.main()
    return json.loads(out.getvalue().strip().splitlines()[-1])


class AndroidKeycodeTest(unittest.TestCase):
    def test_named_keys(self):
        self.assertEqual(execute_task.android_keycode("Enter"), 66)
        self.assertEqual(execute_task.android_keycode("back"), 4)
        self.assertEqual(execute_task.android_keycode("Backspace"), 67)

    def test_letters_digits_punctuation(self):
        self.assertEqual(execute_task.android_keycode("a"), 29)
        self.assertEqual(execute_task.android_keycode("Z"), 54)
        self.assertEqual(execute_task.android_keycode("0"), 7)
        self.assertEqual(execute_task.android_keycode("9"), 16)
        self.assertEqual(execute_task.android_keycode("@"), 77)
        self.assertEqual(execute_task.android_keycode("."), 56)

    def test_unknown_key_is_none_not_enter(self):
        self.assertIsNone(execute_task.android_keycode("f13"))
        self.assertIsNone(execute_task.android_keycode(""))
        self.assertIsNone(execute_task.android_keycode("é"))


class ParseDelayTest(unittest.TestCase):
    def test_sources_and_fallbacks(self):
        self.assertEqual(execute_task.parse_delay_ms({"delayMs": 250}), 250)
        self.assertEqual(execute_task.parse_delay_ms({"delay": "120"}), 120)
        self.assertEqual(execute_task.parse_delay_ms({"durationMs": 80.7}), 80)
        self.assertEqual(execute_task.parse_delay_ms({"delayMs": -5}), 0)
        self.assertEqual(execute_task.parse_delay_ms({"delayMs": "soon"}), 500)
        self.assertEqual(execute_task.parse_delay_ms({}), 500)


class AndroidBranchTest(unittest.TestCase):
    def test_wait_succeeds_on_android(self):
        with mock.patch.object(execute_task.time, "sleep") as sleep:
            result = run({"targetDevice": "android", "task": {"action": "wait", "delayMs": "300"}})
        self.assertTrue(result["success"])
        self.assertNotIn("error", result)
        sleep.assert_called_once_with(0.3)

    def test_sleep_alias_on_android(self):
        with mock.patch.object(execute_task.time, "sleep"):
            result = run({"targetDevice": "android", "task": {"action": "sleep", "durationMs": 10}})
        self.assertTrue(result["success"])

    def test_unknown_key_sends_no_keyevent(self):
        with mock.patch.object(execute_task, "execute_adb_keyevent") as keyevent:
            result = run({"targetDevice": "android", "task": {"action": "key", "key": "hyper_x"}})
        self.assertFalse(result["success"])
        self.assertIn("hyper_x", result["error"])
        keyevent.assert_not_called()

    def test_known_key_sends_its_keycode(self):
        with mock.patch.object(execute_task, "execute_adb_keyevent") as keyevent:
            result = run({"targetDevice": "android", "deviceId": "emu", "task": {"action": "key", "key": "back"}})
        self.assertTrue(result["success"])
        keyevent.assert_called_once_with(4, "emu")


if __name__ == "__main__":
    unittest.main()
