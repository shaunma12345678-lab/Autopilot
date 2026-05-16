/**
 * AutoPilot cinematic audio engine — Web Audio API synthesis.
 * No audio files required. Synthesizes ambient drone + per-beat activation sounds.
 * Must be initialized from a user gesture (browser autoplay policy).
 */

export class AutoPilotAudio {
  private ctx: AudioContext | null = null
  private ambientGain: GainNode | null = null
  private masterGain: GainNode | null = null
  private osc1: OscillatorNode | null = null
  private osc2: OscillatorNode | null = null
  private osc3: OscillatorNode | null = null
  private _muted = false
  private _started = false

  get isMuted() { return this._muted }

  init() {
    if (this.ctx) return
    try {
      this.ctx = new AudioContext()
      this._buildAmbient()
    } catch {
      // AudioContext unavailable (SSR or blocked)
    }
  }

  private _buildAmbient() {
    const ctx = this.ctx!

    // Three oscillators: sub-bass drone, octave + slight detune, high shimmer
    this.osc1 = ctx.createOscillator()
    this.osc1.type = 'sine'
    this.osc1.frequency.value = 38

    this.osc2 = ctx.createOscillator()
    this.osc2.type = 'sine'
    this.osc2.frequency.value = 76.18 // 0.18Hz beat frequency = ~5.5s cycle

    this.osc3 = ctx.createOscillator()
    this.osc3.type = 'triangle'
    this.osc3.frequency.value = 228.5

    // Individual gain shaping
    const g1 = ctx.createGain(); g1.gain.value = 0.55
    const g2 = ctx.createGain(); g2.gain.value = 0.35
    const g3 = ctx.createGain(); g3.gain.value = 0.06

    // Warmth filter on sub-oscillators
    const lpf = ctx.createBiquadFilter()
    lpf.type = 'lowpass'
    lpf.frequency.value = 280
    lpf.Q.value = 1.2

    // Reverb via feedback delay network
    const delayA = ctx.createDelay(4)
    delayA.delayTime.value = 1.1
    const delayB = ctx.createDelay(4)
    delayB.delayTime.value = 0.7
    const fbGainA = ctx.createGain(); fbGainA.gain.value = 0.28
    const fbGainB = ctx.createGain(); fbGainB.gain.value = 0.22

    // Ambient mix bus
    this.ambientGain = ctx.createGain()
    this.ambientGain.gain.value = 0 // fades in via startAmbient()

    // Master
    this.masterGain = ctx.createGain()
    this.masterGain.gain.value = 1

    // Routing
    this.osc1.connect(g1); this.osc2.connect(g2); this.osc3.connect(g3)
    g1.connect(lpf); g2.connect(lpf); g3.connect(lpf)
    lpf.connect(this.ambientGain)
    lpf.connect(delayA); delayA.connect(fbGainA); fbGainA.connect(delayA)
    lpf.connect(delayB); delayB.connect(fbGainB); fbGainB.connect(delayB)
    fbGainA.connect(this.ambientGain)
    fbGainB.connect(this.ambientGain)
    this.ambientGain.connect(this.masterGain)
    this.masterGain.connect(ctx.destination)

    this.osc1.start()
    this.osc2.start()
    this.osc3.start()
    this._started = true
  }

  startAmbient() {
    if (!this.ctx || !this.ambientGain || this._muted) return
    const t = this.ctx.currentTime
    this.ambientGain.gain.cancelScheduledValues(t)
    this.ambientGain.gain.setValueAtTime(0, t)
    this.ambientGain.gain.linearRampToValueAtTime(0.14, t + 3.5)
  }

  /** Play a cinematic "activation" sound for the given story beat index (0–4) */
  playBeat(beatIndex: number) {
    if (!this.ctx || this._muted) return
    const ctx = this.ctx
    const now = ctx.currentTime

    // Per-beat pitch map (Hz)
    const pitches = [660, 528, 880, 440, 990]
    const freq = pitches[beatIndex % pitches.length]

    // --- Tonal ping ---
    const pingOsc = ctx.createOscillator()
    const pingEnv = ctx.createGain()
    pingOsc.type = 'sine'
    pingOsc.frequency.setValueAtTime(freq * 2, now)
    pingOsc.frequency.exponentialRampToValueAtTime(freq, now + 0.4)
    pingEnv.gain.setValueAtTime(0.18, now)
    pingEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.7)
    pingOsc.connect(pingEnv)
    pingEnv.connect(ctx.destination)
    pingOsc.start(now)
    pingOsc.stop(now + 0.7)

    // --- Noise sweep (filtered whoosh) ---
    const bufLen = Math.floor(ctx.sampleRate * 0.18)
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1)
    const noise = ctx.createBufferSource()
    noise.buffer = buf
    const sweepF = ctx.createBiquadFilter()
    sweepF.type = 'bandpass'
    sweepF.frequency.setValueAtTime(4000, now)
    sweepF.frequency.exponentialRampToValueAtTime(150, now + 0.18)
    sweepF.Q.value = 6
    const sweepEnv = ctx.createGain()
    sweepEnv.gain.setValueAtTime(0.07, now)
    sweepEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
    noise.connect(sweepF)
    sweepF.connect(sweepEnv)
    sweepEnv.connect(ctx.destination)
    noise.start(now)

    // --- Sub thump ---
    const thumpOsc = ctx.createOscillator()
    const thumpEnv = ctx.createGain()
    thumpOsc.type = 'sine'
    thumpOsc.frequency.setValueAtTime(80, now)
    thumpOsc.frequency.exponentialRampToValueAtTime(30, now + 0.12)
    thumpEnv.gain.setValueAtTime(0.35, now)
    thumpEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
    thumpOsc.connect(thumpEnv)
    thumpEnv.connect(ctx.destination)
    thumpOsc.start(now)
    thumpOsc.stop(now + 0.25)
  }

  mute() {
    if (!this.ctx || !this.masterGain) return
    this._muted = true
    this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.4)
  }

  unmute() {
    if (!this.ctx || !this.masterGain) return
    this._muted = false
    this.masterGain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 0.4)
  }

  toggle() {
    this._muted ? this.unmute() : this.mute()
    return !this._muted
  }

  destroy() {
    try {
      this.osc1?.stop(); this.osc2?.stop(); this.osc3?.stop()
      this.ctx?.close()
    } catch { /* already stopped */ }
    this.ctx = null
    this.ambientGain = null
    this.masterGain = null
    this._started = false
  }
}

// Singleton — shared across components
export const audioEngine = typeof window !== 'undefined' ? new AutoPilotAudio() : null
