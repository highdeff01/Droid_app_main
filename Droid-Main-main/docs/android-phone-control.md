# Android QR connection and background recording

## What is connected

Open **Screen → QR link → Android connection, mirror & recording** in the desktop studio. This panel controls a real Android device through the ADB installed **on the computer running the server**. The QR grants access to that selected device; it does not install an Android control service or grant debugging permissions.

The **Pair Android app** option connects the native companion without ADB. Download its buildable project from the same panel, or use `android/` in this repository. Build with Android Studio or its included Gradle wrapper (`./gradlew assembleDebug`, Android SDK 35 and JDK 17). Android 11+ is required. Installing the PWA alone does not enable full phone capture.

## Native companion QR pairing

1. Set the server URL reachable from the phone and enter the administrator API key if accessing the studio remotely.
2. Click **Pair Android app**. Its invitation expires after five minutes and is used once; the desktop receives a separate control credential.
3. Scan the QR with the phone camera and select **Open Android app**, or paste the complete QR link into the companion's **Connect QR link** field. Confirm the server on the phone.
4. Enable **Sightline accessibility** in Android Settings. It provides full-display screenshots and approved tap, swipe, text and navigation commands.
5. Tap **Start sharing** and approve Android's capture prompt. The desktop panel now receives the real phone screen. Enable **Tap / swipe to control** to interact, or ask AI to inspect it and approve its proposed action.
6. Tap **Record full phone** on the phone, or **Record phone** on the desktop during a sharing session. Video stays in app-private storage, with a visible foreground notification. Switch apps or leave the studio; capture continues independently of the Activity and network connection. **Saved recordings / Share video** exports finalized videos. The time limit and storage limit are enforced on the phone.

Revoking the desktop connection removes remote viewing/control. A native recording already running continues locally until its limit or the phone's notification Stop button. Android can end capture when locking, stopping screen sharing, or killing the app; new consent is required to restart. Protected content may be blank. Rotation stops and saves the recording; restart in the new orientation. Native video recording is video only and does not upload MP4s to the server; use action recording below for replayable workflows.

Pairing errors are explicit: an expired invitation reports "QR invitation expired (invitations last 5 minutes)", a reused or unknown one reports "invalid or already used", and a network failure reports "Cannot reach server …". The token is kept in the app's private preferences, so the phone reconnects after network loss (polling retries every second and the notification shows "offline, retrying") or an app restart (tap **Start sharing** again; Android requires fresh capture consent). The desktop panel shows the invitation countdown until the phone pairs.

### Background control, indicator and popups

Sharing, screenshots and accessibility actions run in the foreground service and accessibility service, not the Activity, so AI control and workflows continue while you use other apps. The ongoing notification shows server connection, sharing/recording state, action-recording state, AI state (thinking / acting / waiting for approval) and workflow progress. Enable **Show status badge over other apps** for the same line as an accessibility overlay (no "display over other apps" permission is needed while accessibility is enabled). Popups for workflow started/finished/failed, goal complete and approval needed use a separate high-importance channel and are shown only when notifications are permitted (Android 13+ asks); otherwise they appear in the app's status text. Goal-complete is shown only when the model reports `complete:true`.

Command acknowledgments are retried three times. If the server's 12 s deadline has passed, it answers `accepted:false` and the phone says the server no longer waits for that operation. Desktop timeouts distinguish "nothing was executed" (never picked up) from "did not confirm" (picked up, no answer). The desktop marks a mirror frame older than 5 s as stale and dims it.

### Action recording and workflows

1. With accessibility enabled and the phone paired, tap **Record workflow**, use other apps, return and tap **Stop & upload workflow**.
2. Taps (centre of the tapped element), scrolls (as swipes), typed text appended to a field, and Back/Home/Recents keys are recorded in screen pixels and uploaded to `POST /api/phone/native/workflows`, which stores them in the same workflow store as `/api/mobile-stream/workflows`. Password fields, non-ASCII text and edits that are not pure appends are reported as skipped, never stored as fake steps. Events from the companion itself and within 600 ms of a server-dispatched gesture are ignored.
3. Run a workflow from the phone (**Run saved workflow**, with a run count of 1–25) or the desktop panel's **Saved workflows** (runs plus a per-step repeat count). Runs go through the verified replay engine (fresh screenshot, AI location, execution, AI verification); **Stop running workflow** or the desktop monitor's Cancel stops it between actions. Steps the phone cannot perform make the run request fail before anything executes.

## Connect a phone

1. Install Android SDK Platform Tools on the server computer and make `adb` available on its PATH.
2. Enable Developer options and USB debugging on the phone. Connect by USB and accept the phone's debugging authorization prompt. `adb devices -l` must show the phone as `device`, not `unauthorized` or `offline`.
3. For wireless debugging, use the panel's **Pair** with the pairing address/port and code shown by Android. Then **Connect** with the separate debugging address/port. Both hosts must be able to reach one another. Existing `adb pair` / `adb connect` commands also work.
4. Set `ASSISTANT_API_KEY` on the server when accessing the studio remotely; enter it in the panel. If no key is set, administration is restricted to direct loopback requests. A reverse proxy should be deployed with a key.
5. Click **Find devices**, select the authorized phone, and enter the server URL reachable from the phone, such as the server's LAN address at port 3000. `localhost` on the phone points to the phone itself and is rejected. Use HTTPS for access outside a trusted LAN.
6. Click **Share device QR** and scan it. The link opens `/phone-control`; its token is device-specific, expires after 12 hours, and is removed from the address bar after opening. Treat it as a password. **Disconnect & revoke QR** stops recording and invalidates that pairing. Restarting the server invalidates all pairings.

Do not expose an ADB port directly to the public internet.

## Mirror, control, and AI

- The ADB mirror is a real PNG captured by `adb -s DEVICE exec-out screencap -p`. Native mirrors come from Android accessibility screenshots and become unavailable when capture is stale or permission is disabled.
- Enable **Tap / swipe to control** to interact with the displayed phone. Navigation buttons, ASCII text entry, Copy and Paste use Android input commands. Clipboard buttons act on the device's focused field; they do not transfer the computer clipboard.
- Input errors are reported. An accepted ADB command is not proof that a goal completed: inspect the refreshed phone screen.
- **Inspect with AI** sends a fresh phone screenshot and the goal to the configured Ollama-compatible vision model (`OLLAMA_ENDPOINT`, `OLLAMA_MODEL`, or the app's AI settings). Review the returned single-step action and click **Approve this action**. It does not auto-run an unattended sequence.
- Manual and AI actions compare the current screenshot against the reviewed image. If it changed, refresh or ask AI to inspect again. Plans expire after one minute and are consumed once, preventing accidental duplicate execution. Dynamic video/clocks may require a new preview.
- A vision-capable model and authorized device are required. The UI never substitutes a virtual-phone action for native success.

## ADB phone recording after leaving the page

Select a 1–60 minute limit and **Record phone**. Recording runs on the server using Android `screenrecord`; you can switch to other phone apps or close the web page. Keep the server awake and the phone connected. Stop it from the paired controls or let the selected time limit stop it.

- Capture is segmented into up to three-minute MP4 files. Segments may have brief gaps while transferring. This is display video only, without microphone/system audio. Android may exclude protected screens.
- **Stop & save** waits for the final MP4 to be finalized and copied to the server. Download each finalized segment from the panel.
- Files are stored in `.phone-recordings/` (Git-ignored), or `PHONE_RECORDINGS_DIR`. They remain until the administrator removes them; monitor disk space.
- The administrator's **Saved recordings** list recovers completed segments after a browser or server restart. A server restart/disconnection interrupts active recording; the app reports failure instead of claiming success. Completed local segments remain downloadable. If transfer failed, a finalized `droid-<recording-id>-part-*.mp4` may remain in the phone's `/sdcard/` for manual recovery.
- ADB recording depends on the ADB host. Use the native companion above for standalone recording on the phone.

## Running and testing

Use the synchronized npm lockfile: `npm ci --legacy-peer-deps`. Start development with `npx tsx scripts/start-dev.ts`. Production uses `npm run build` then `npm start`; it serves `dist/spa` and the API on one port. Set `HOST=0.0.0.0` for LAN production access, with `ASSISTANT_API_KEY` configured.

Use a temporary `ASSISTANT_STORAGE_PATH` for test runs so fixtures do not modify the repository's `.data` files. Focused bridge tests inject ADB and AI responses; actual Android input, protected-screen behavior, wireless connectivity, and MP4 playback still need verification on an authorized phone.
