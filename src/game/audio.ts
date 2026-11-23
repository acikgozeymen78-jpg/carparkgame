export class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private lastBeepTime = 0;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(muted ? 0 : 0.03, this.ctx.currentTime, 0.05);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public startEngineLoop(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.engineOsc) return;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = 54;

    filter.type = 'lowpass';
    filter.frequency.value = 180;
    filter.Q.value = 2.5;

    gain.gain.value = this.muted ? 0 : 0.025;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    this.engineOsc = osc;
    this.engineFilter = filter;
    this.engineGain = gain;
  }

  public stopEngineLoop(): void {
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
    }
  }

  public updateEngine(
    speedAbs: number,
    accelerating: boolean,
    active: boolean,
    turboActive = false,
  ): void {
    if (!this.ctx || !this.engineOsc || !this.engineFilter || !this.engineGain) return;
    const now = this.ctx.currentTime;
    if (this.muted || !active) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.06);
      return;
    }
    const normSpeed = Math.min(1, speedAbs / 20);
    const freq = 52 + normSpeed * 95 + (accelerating ? 16 : 0) + (turboActive ? 38 : 0);
    const cutoff = 160 + normSpeed * 380 + (accelerating ? 140 : 0) + (turboActive ? 260 : 0);
    const vol = 0.02 + normSpeed * 0.025 + (accelerating ? 0.012 : 0) + (turboActive ? 0.014 : 0);

    this.engineOsc.frequency.setTargetAtTime(freq, now, 0.06);
    this.engineFilter.frequency.setTargetAtTime(cutoff, now, 0.06);
    this.engineGain.gain.setTargetAtTime(vol, now, 0.06);
  }

  public playCollision(intensity: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const baseFreq = 115 - intensity * 35;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.16);

    gain.gain.setValueAtTime(0.18 * Math.max(0.3, intensity), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playParkingSensor(
    closestObstacleDist: number,
    insideBay: boolean,
    isMoving: boolean,
  ): void {
    const activeThreshold = insideBay ? 8.0 : isMoving ? 2.4 : 1.1;
    if (this.muted || closestObstacleDist > activeThreshold) return;
    const nowMs = performance.now();
    const interval =
      closestObstacleDist < 0.65
        ? 110
        : insideBay
          ? 165
          : Math.max(145, closestObstacleDist * 140);
    if (nowMs - this.lastBeepTime < interval) return;
    this.lastBeepTime = nowMs;

    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value =
      closestObstacleDist < 0.65 ? 1240 : insideBay ? 1046 : 820;
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playTokenPickup(kind: 'star' | 'time'): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const notes = kind === 'star' ? [659.25, 987.77] : [587.33, 880, 1174.66];
    notes.forEach((freq, idx) => {
      const t = ctx.currentTime + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.085, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.21);
    });
  }

  public playBoostPad(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.22);
    gain.gain.setValueAtTime(0.075, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  public playCheckpoint(combo: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const base = 523.25 * Math.pow(1.08, Math.max(0, combo - 1));
    [base, base * 1.25].forEach((freq, idx) => {
      const t = ctx.currentTime + idx * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.085, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  public playAchievement(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const t = ctx.currentTime + idx * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  public playVictory(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const chord = [440, 554.37, 659.25, 880];
    chord.forEach((freq, idx) => {
      const t = ctx.currentTime + idx * 0.085;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  public playTrafficViolation(severity: 'light' | 'medium' | 'severe'): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const notes =
      severity === 'severe'
        ? [980, 740, 1120]
        : severity === 'medium'
          ? [860, 620]
          : [720];
    notes.forEach((freq, idx) => {
      const t = ctx.currentTime + idx * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = severity === 'severe' ? 'sawtooth' : 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(severity === 'severe' ? 0.07 : 0.045, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.13);
    });
  }

  public playTrafficBonus(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    [587.33, 783.99].forEach((freq, idx) => {
      const t = ctx.currentTime + idx * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.065, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.19);
    });
  }

  public playDefeat(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const notes = [311.13, 277.18, 220];
    notes.forEach((freq, idx) => {
      const t = ctx.currentTime + idx * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.32);
    });
  }

  public playClick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, t);
    osc.frequency.exponentialRampToValueAtTime(410, t + 0.045);
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.055);
  }

  public dispose(): void {
    if (this.engineOsc) {
      try {
        this.engineOsc.stop();
      } catch {
        // ignore
      }
      this.engineOsc.disconnect();
      this.engineOsc = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
