"use client";

type SoundType = 
  | "click" 
  | "success" 
  | "win" 
  | "notification" 
  | "error" 
  | "whoosh" 
  | "pop" 
  | "coin" 
  | "levelup" 
  | "hover";

interface SoundConfig {
  type: SoundType;
  volume?: number;
  playbackRate?: number;
}

class AudioManager {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private masterVolume = 0.5;
  private sounds: Map<SoundType, () => AudioBufferSourceNode> = new Map();
  private initialized = false;
  private userInteracted = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.initOnInteraction();
    }
  }

  private initOnInteraction() {
    const init = () => {
      if (this.userInteracted) return;
      this.userInteracted = true;
      this.initAudioContext();
      document.removeEventListener("click", init);
      document.removeEventListener("touchstart", init);
      document.removeEventListener("keydown", init);
    };
    document.addEventListener("click", init, { once: true, passive: true });
    document.addEventListener("touchstart", init, { once: true, passive: true });
    document.addEventListener("keydown", init, { once: true, passive: true });
  }

  private initAudioContext() {
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.createSounds();
      this.initialized = true;
    } catch (e) {
      console.warn("AudioContext not available:", e);
    }
  }

  private createSounds() {
    if (!this.ctx) return;

    this.sounds.set("click", () => this.createClick());
    this.sounds.set("success", () => this.createSuccess());
    this.sounds.set("win", () => this.createWin());
    this.sounds.set("notification", () => this.createNotification());
    this.sounds.set("error", () => this.createError());
    this.sounds.set("whoosh", () => this.createWhoosh());
    this.sounds.set("pop", () => this.createPop());
    this.sounds.set("coin", () => this.createCoin());
    this.sounds.set("levelup", () => this.createLevelUp());
    this.sounds.set("hover", () => this.createHover());
  }

  private createOscillator(freq: number, type: OscillatorType = "sine"): OscillatorNode {
    const osc = this.ctx!.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    return osc;
  }

  private createGain(): GainNode {
    return this.ctx!.createGain();
  }

  private createClick(): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / ctx.sampleRate;
      data[i] = Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 50) * 0.3;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.4;
    source.connect(gain).connect(ctx.destination);
    return source;
  }

  private createSuccess(): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const notes = [523.25, 659.25, 783.99, 1046.5];
    for (let i = 0; i < buffer.length; i++) {
      const t = i / ctx.sampleRate;
      const noteIndex = Math.floor(t / 0.1);
      if (noteIndex < notes.length) {
        const noteT = t - noteIndex * 0.1;
        data[i] = Math.sin(2 * Math.PI * notes[noteIndex] * noteT) * Math.exp(-noteT * 8) * 0.25;
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    source.connect(gain).connect(ctx.destination);
    return source;
  }

  private createWin(): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const melody = [
      { freq: 523.25, dur: 0.15 },  // C5
      { freq: 659.25, dur: 0.15 },  // E5
      { freq: 783.99, dur: 0.15 },  // G5
      { freq: 1046.5, dur: 0.2 },   // C6
      { freq: 1318.5, dur: 0.15 },  // E6
      { freq: 1567.98, dur: 0.3 },  // G6
    ];
    let sampleIndex = 0;
    for (const note of melody) {
      const noteSamples = Math.min(note.dur * ctx.sampleRate, buffer.length - sampleIndex);
      for (let i = 0; i < noteSamples; i++) {
        const t = i / ctx.sampleRate;
        const envelope = Math.exp(-t * 3) * (1 - t / note.dur);
        data[sampleIndex + i] += Math.sin(2 * Math.PI * note.freq * t) * envelope * 0.3;
      }
      sampleIndex += note.dur * ctx.sampleRate;
      if (sampleIndex >= buffer.length) break;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.6;
    source.connect(gain).connect(ctx.destination);
    return source;
  }

  private createNotification(): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / ctx.sampleRate;
      const freq = 880 + Math.sin(t * 20) * 50;
      data[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 6) * 0.3;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.4;
    source.connect(gain).connect(ctx.destination);
    return source;
  }

  private createError(): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / ctx.sampleRate;
      data[i] = (Math.sin(2 * Math.PI * 200 * t) + Math.sin(2 * Math.PI * 150 * t)) * Math.exp(-t * 10) * 0.25;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.4;
    source.connect(gain).connect(ctx.destination);
    return source;
  }

  private createWhoosh(): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / ctx.sampleRate;
      const noise = (Math.random() * 2 - 1) * 0.1;
      const tone = Math.sin(2 * Math.PI * (400 + 800 * (1 - t / 0.25)) * t) * Math.exp(-t * 8) * 0.15;
      data[i] = noise + tone;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    source.connect(gain).connect(ctx.destination);
    return source;
  }

  private createPop(): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / ctx.sampleRate;
      data[i] = Math.sin(2 * Math.PI * 800 * t) * Math.exp(-t * 80) * 0.4;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    source.connect(gain).connect(ctx.destination);
    return source;
  }

  private createCoin(): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / ctx.sampleRate;
      data[i] = Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 15) * 0.4;
      data[i] += Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-t * 20) * 0.2;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    source.connect(gain).connect(ctx.destination);
    return source;
  }

  private createLevelUp(): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const notes = [
      { freq: 523.25, time: 0, dur: 0.1 },
      { freq: 659.25, time: 0.08, dur: 0.1 },
      { freq: 783.99, time: 0.16, dur: 0.1 },
      { freq: 1046.5, time: 0.24, dur: 0.15 },
      { freq: 1318.5, time: 0.35, dur: 0.15 },
      { freq: 1567.98, time: 0.45, dur: 0.25 },
    ];
    for (const note of notes) {
      const startSample = Math.floor(note.time * ctx.sampleRate);
      const noteSamples = Math.min(note.dur * ctx.sampleRate, buffer.length - startSample);
      for (let i = 0; i < noteSamples; i++) {
        const t = i / ctx.sampleRate;
        const envelope = Math.exp(-t * 4) * Math.sin(Math.PI * t / note.dur);
        data[startSample + i] += Math.sin(2 * Math.PI * note.freq * t) * envelope * 0.25;
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.6;
    source.connect(gain).connect(ctx.destination);
    return source;
  }

  private createHover(): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / ctx.sampleRate;
      data[i] = Math.sin(2 * Math.PI * 2000 * t) * Math.exp(-t * 100) * 0.15;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.3;
    source.connect(gain).connect(ctx.destination);
    return source;
  }

  async play(type: SoundType, config: Partial<SoundConfig> = {}): Promise<void> {
    if (!this.enabled || !this.initialized || !this.ctx) return;

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    const creator = this.sounds.get(type);
    if (!creator) return;

    try {
      const source = creator();
      const gain = this.ctx.createGain();
      gain.gain.value = (config.volume ?? 1) * this.masterVolume;
      if (config.playbackRate) {
        source.playbackRate.value = config.playbackRate;
      }
      source.connect(gain).connect(this.ctx.destination);
      source.start(0);
    } catch (e) {
      console.warn(`Failed to play sound ${type}:`, e);
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  getVolume(): number {
    return this.masterVolume;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }
}

export const audioManager = new AudioManager();

export function playSound(type: SoundType, config?: Partial<SoundConfig>) {
  return audioManager.play(type, config);
}

export function useSound() {
  return {
    play: playSound,
    click: () => playSound("click"),
    success: () => playSound("success"),
    win: () => playSound("win"),
    notification: () => playSound("notification"),
    error: () => playSound("error"),
    whoosh: () => playSound("whoosh"),
    pop: () => playSound("pop"),
    coin: () => playSound("coin"),
    levelup: () => playSound("levelup"),
    hover: () => playSound("hover"),
    setEnabled: (enabled: boolean) => audioManager.setEnabled(enabled),
    setVolume: (volume: number) => audioManager.setVolume(volume),
    isEnabled: () => audioManager.isEnabled(),
    getVolume: () => audioManager.getVolume(),
  };
}