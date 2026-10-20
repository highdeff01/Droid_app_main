// Cyberpunk Procedural Audio Synthesizer using Web Audio API
/**
 * Generates short synthesized sound effects (clicks, alarms, chimes, etc.)
 * on demand using the Web Audio API, lazily creating the `AudioContext`.
 */
class AudioSynthesizer {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;
  public volume: number = 0.5;

  /** Lazily creates the underlying `AudioContext` if one does not exist yet. */
  private initCtx() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtxClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
  }

  // Mechanical Click & Tap Cue
  /** Plays a short mechanical click tone, optionally at a custom base frequency. */
  public playClickSound(freq?: number) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    const startFreq = freq || 800;
    osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(80, startFreq * 0.15),
      this.ctx.currentTime + 0.04,
    );

    gain.gain.setValueAtTime(this.volume * 0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.04);
  }

  /** Plays the sound used to signal that a task has completed. */
  public playTaskCompleteSound() {
    this.playSuccessSound();
  }

  // Keypress Typing Tap
  /** Plays a short tap tone to accompany simulated keystrokes. */
  public playKeypressSound() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      300,
      this.ctx.currentTime + 0.03,
    );

    gain.gain.setValueAtTime(this.volume * 0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.03);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.03);
  }

  // Waypoint Reach Glide
  /** Plays an ascending glide tone used when a waypoint has been reached. */
  public playWaypointSound() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      880,
      this.ctx.currentTime + 0.08,
    );

    gain.gain.setValueAtTime(this.volume * 0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  // Warning Alarm / Error Pulse
  /** Plays a descending sawtooth pulse used to signal a warning or error. */
  public playWarningSound() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(350, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(220, this.ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(this.volume * 0.5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  // Sequence Victory / Success Fanfare
  /** Plays a short four-note ascending fanfare to signal success. */
  public playSuccessSound() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;

      const startTime = this.ctx!.currentTime + idx * 0.07;
      gain.gain.setValueAtTime(this.volume * 0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.2);
    });
  }

  // AI Thinking Harmonic Pulse
  /** Plays a rising harmonic pulse used while the AI is "thinking". */
  public playThinkingSound() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(660, this.ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(this.volume * 0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  // Audio helper aliases
  /** Alias for {@link playWaypointSound}. */
  public playLaserShot() {
    this.playWaypointSound();
  }

  /** Alias for {@link playClickSound}. */
  public playActionCue() {
    this.playClickSound();
  }

  /** Alias for {@link playKeypressSound}. */
  public playShutterSound() {
    this.playKeypressSound();
  }

  /** Alias for {@link playWarningSound}. */
  public playAlarmSound() {
    this.playWarningSound();
  }

  /** Alias for {@link playSuccessSound}. */
  public playSuccessChime() {
    this.playSuccessSound();
  }
}

export const audioSynthesizer = new AudioSynthesizer();
/** Plays a short click pip sound, optionally at a custom frequency. */
export const playClickPip = (freq?: number) => {
  audioSynthesizer.playClickSound(freq);
};
