# Sightline Android companion

Android 11+ (API 30), Android SDK 35, JDK 17 are required. A Gradle 8.9 wrapper is included.
Open this directory in Android Studio and build/run `app`, or run:

```sh
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

In the desktop Screen → QR link panel, set the server's reachable LAN/HTTPS URL and click **Pair Android app**. Scan the QR with the phone camera, then choose **Open Android app**. Or paste the entire QR link into the Android companion and tap **Connect QR link**. Invitations expire after five minutes and can be used once.

Enable Sightline in Android Accessibility settings to share the full display and execute approved touch/text commands. Tap **Start sharing** and approve Android's screen-capture prompt. Desktop AI uses the real shared screenshot and requires approval for each action.

**Record full phone** starts a video-only MP4 in app-private storage using MediaProjection and MediaRecorder. Recording continues when you leave this app, close the desktop browser, or lose the server connection. A foreground notification displays recording status and a **Stop** action. The selected 1–60 minute limit runs on the phone. The desktop can also start/stop recording during an active sharing session. Share/download saved videos from **Saved recordings** in the Android app; native recordings are not uploaded to the server.

No audio is recorded. Protected screens may appear blank. Android may end capture when the screen locks, the user stops sharing, or the app is killed; capture cannot silently restart without new consent. Do not force-stop the app while recording. Keep free storage available. Videos remain until the app's data is cleared or it is uninstalled. Screen rotation stops and saves the current recording; start again in the new orientation.

A PWA or Bubblewrap wrapper retains browser permissions and does not provide these native capabilities. ADB is optional for the native companion. Plain HTTP is enabled for a trusted local LAN; use HTTPS for other networks. Pairing sends screenshots only to the server the user explicitly connects to.
