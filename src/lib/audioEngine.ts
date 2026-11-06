import * as Tone from 'tone';
import { TrackData } from '../types';

export interface SoundPreset {
  id: string;
  name: string;
  category: 'instrument' | 'sample' | 'loop';
  description: string;
  defaultNotes?: string[];
}

export const PRESET_OPTIONS: SoundPreset[] = [
  // Instruments
  { id: 'poly_synth', name: 'Warm PolySynth Chords', category: 'instrument', description: 'Lush 4-voice polyphonic analog chords', defaultNotes: ['C4', 'E4', 'G4', 'B4'] },
  { id: 'fm_lead', name: 'Cyberpunk FM Lead', category: 'instrument', description: 'Edgy bright FM synthesizer with metallic attack', defaultNotes: ['A4', 'C5', 'E5', 'G5'] },
  { id: 'sub_bass', name: 'Deep Sub Bass', category: 'instrument', description: 'Punchy low-end analog sine/saw bassline', defaultNotes: ['C2', 'Eb2', 'G2', 'Bb2'] },
  { id: 'ambient_pad', name: 'Cosmic Ambient Pad', category: 'instrument', description: 'Dreamy slow-attack atmospheric texture', defaultNotes: ['F3', 'A3', 'C4', 'E4'] },
  { id: 'pluck_bell', name: 'Crystal Pluck Bells', category: 'instrument', description: 'Resonant acoustic-style plucked harp/bell tones', defaultNotes: ['E4', 'G4', 'B4', 'D5'] },
  
  // Drum & Sample Patterns
  { id: 'beat_808', name: '808 Trap Groove', category: 'sample', description: 'Deep sub kick, snappy clap & rapid hi-hats' },
  { id: 'beat_techno', name: 'Four-on-the-Floor Techno', category: 'sample', description: 'Driving 130BPM punchy kick & off-beat open hat' },
  { id: 'beat_lofi', name: 'Lo-Fi Chill Hop Beat', category: 'sample', description: 'Dusty acoustic boom-bap kick and rimshot' },
  { id: 'beat_house', name: 'Deep House Groove', category: 'sample', description: 'Warm thumping kick, crisp shaker & claps' },

  // Live Looper Tracks
  { id: 'mic_loop_10s', name: '10s Conductor Mic Looper', category: 'loop', description: 'Standard 10-second live acoustic/vocal looper' },
  { id: 'mic_loop_5s', name: '5s Quick Phrase Looper', category: 'loop', description: 'Fast 5-second rhythmic vocal/instrument catch' },
  { id: 'mic_loop_16s', name: '16s Extended Looper', category: 'loop', description: 'Long-form live audio capture buffer' },
];

export const GESTURE_OPTIONS = [
  { id: 'Point Up', label: '☝️ Point Up', description: 'Single index finger extended' },
  { id: 'Open Palm', label: '🖐️ Open Palm', description: 'All fingers open & extended' },
  { id: 'Peace Sign', label: '✌️ Peace Sign', description: 'Index and middle fingers up' },
  { id: 'Rock On', label: '🤘 Rock / Horns', description: 'Index and pinky fingers up' },
  { id: 'Thumbs Up', label: '👍 Thumbs Up', description: 'Thumb pointed upward' },
  { id: 'Call Me', label: '🤙 Call Me', description: 'Thumb and pinky extended' },
  { id: 'Three Fingers', label: '🖖 Three Fingers', description: 'Index, middle, and ring fingers up' },
  { id: 'Manual Only', label: '🔘 Manual / Unassigned', description: 'Triggered via on-screen controls only' },
];

export class AudioEngine {
  private synths: Map<string, any> = new Map();
  private loops: Map<string, Tone.Player> = new Map();
  private drumPatterns: Map<string, { kick: Tone.MembraneSynth; snare: Tone.NoiseSynth; hat: Tone.MetalSynth; loopEvent?: Tone.Loop | Tone.Sequence }> = new Map();
  private isInitialized = false;

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    await Tone.start();
    if (Tone.Transport.state !== 'started') {
      Tone.Transport.bpm.value = 124;
      Tone.Transport.start();
    }
    this.isInitialized = true;
  }

  public registerTrack(track: TrackData): void {
    const volumeValue = track.muted ? -Infinity : (track.volume ?? -6);

    if (track.type === 'instrument') {
      const presetId = track.preset || 'poly_synth';
      let synthNode: any;

      if (presetId === 'fm_lead') {
        synthNode = new Tone.PolySynth(Tone.FMSynth, {
          harmonicity: 2,
          modulationIndex: 3,
          envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.8 },
          modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.5 }
        }).toDestination();
      } else if (presetId === 'sub_bass') {
        synthNode = new Tone.MonoSynth({
          oscillator: { type: 'sawtooth' },
          filter: { Q: 3, type: 'lowpass', rolloff: -24 },
          envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.4 },
          filterEnvelope: { attack: 0.02, decay: 0.2, sustain: 0.2, release: 0.2, baseFrequency: 60, octaves: 3 }
        }).toDestination();
      } else if (presetId === 'ambient_pad') {
        synthNode = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.4, decay: 1.0, sustain: 0.8, release: 1.5 }
        }).toDestination();
      } else if (presetId === 'pluck_bell') {
        synthNode = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sine' },
          envelope: { attack: 0.005, decay: 0.8, sustain: 0.05, release: 1.0 }
        }).toDestination();
      } else {
        // Default warm poly synth
        synthNode = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
          envelope: { attack: 0.05, decay: 0.3, sustain: 0.4, release: 0.8 }
        }).toDestination();
      }

      synthNode.volume.value = volumeValue;
      this.synths.set(track.id, synthNode);
    } else if (track.type === 'sample') {
      // Drum generator setup
      const kick = new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 6,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 0.4 }
      }).toDestination();

      const snare = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.2, sustain: 0.0 }
      }).toDestination();

      const hat = new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 0.08, release: 0.05 },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
        octaves: 1.5
      }).toDestination();

      kick.volume.value = volumeValue;
      snare.volume.value = volumeValue - 4;
      hat.volume.value = volumeValue - 8;

      this.drumPatterns.set(track.id, { kick, snare, hat });
    }
  }

  public playInstrumentTrack(track: TrackData): void {
    if (!this.synths.has(track.id)) {
      this.registerTrack(track);
    }
    const synth = this.synths.get(track.id);
    if (!synth) return;

    const preset = PRESET_OPTIONS.find(p => p.id === track.preset);
    const notes = track.notes && track.notes.length > 0 
      ? track.notes 
      : (preset?.defaultNotes || ['C4', 'E4', 'G4', 'B4']);

    if (track.preset === 'sub_bass') {
      synth.triggerAttackRelease(notes[0] || 'C2', '4n');
    } else {
      synth.triggerAttackRelease(notes, '4n');
    }
  }

  public playSampleTrack(track: TrackData): void {
    try {
      if (!this.drumPatterns.has(track.id)) {
        this.registerTrack(track);
      }
      const drums = this.drumPatterns.get(track.id);
      if (!drums) return;

      const now = Tone.now() + 0.01;
      const preset = track.preset || 'beat_808';

      if (preset === 'beat_techno') {
        // 4-beat techno burst
        drums.kick.triggerAttackRelease('C1', '8n', now);
        drums.hat.triggerAttackRelease('16n', now + 0.12);
        drums.kick.triggerAttackRelease('C1', '8n', now + 0.24);
        drums.snare.triggerAttackRelease('8n', now + 0.24);
        drums.hat.triggerAttackRelease('16n', now + 0.36);
      } else if (preset === 'beat_lofi') {
        // Chill hop
        drums.kick.triggerAttackRelease('F1', '8n', now);
        drums.hat.triggerAttackRelease('16n', now + 0.15);
        drums.snare.triggerAttackRelease('16n', now + 0.3);
        drums.hat.triggerAttackRelease('16n', now + 0.45);
      } else {
        // 808 Trap beat burst
        drums.kick.triggerAttackRelease('C1', '8n', now);
        drums.hat.triggerAttackRelease('32n', now + 0.08);
        drums.hat.triggerAttackRelease('32n', now + 0.16);
        drums.snare.triggerAttackRelease('8n', now + 0.24);
        drums.kick.triggerAttackRelease('G0', '8n', now + 0.36);
        drums.hat.triggerAttackRelease('32n', now + 0.44);
      }
    } catch (e) {
      console.warn("Error playing sample track pattern:", e);
    }
  }

  public setLoopPlayer(trackId: string, audioUrl: string, volume: number): void {
    if (this.loops.has(trackId)) {
      try {
        const old = this.loops.get(trackId);
        old?.stop();
        old?.dispose();
      } catch (e) {
        console.warn("Error disposing old loop player:", e);
      }
    }
    try {
      const player = new Tone.Player({
        url: audioUrl,
        loop: true,
        autostart: true,
      }).toDestination();
      player.volume.value = volume;
      this.loops.set(trackId, player);
    } catch (e) {
      console.error("Error setting loop player:", e);
    }
  }

  public createFallbackLoop(trackId: string, durationSec: number = 10, volume: number = -6): void {
    try {
      const sampleRate = Tone.getContext().sampleRate || 44100;
      const safeDuration = Math.max(0.4, durationSec);
      const numSamples = Math.floor(sampleRate * safeDuration);
      const buffer = Tone.getContext().createBuffer(2, numSamples, sampleRate);
      const leftChannel = buffer.getChannelData(0);
      const rightChannel = buffer.getChannelData(1);
      
      const baseFreqs = [261.63, 329.63, 392.00, 523.25, 440.00, 329.63];
      const bpm = 120;
      const beatSec = 60 / bpm;
      const totalBeats = Math.max(1, Math.floor(safeDuration / beatSec));

      for (let beat = 0; beat < totalBeats; beat++) {
        const beatStartSample = Math.floor(beat * beatSec * sampleRate);
        const beatNoteFreq = baseFreqs[beat % baseFreqs.length];
        const noteLenSamples = Math.floor(0.35 * sampleRate);

        for (let s = 0; s < noteLenSamples && (beatStartSample + s) < numSamples; s++) {
          const t = s / sampleRate;
          const envelope = Math.exp(-7 * t);
          const sampleVal = (Math.sin(2 * Math.PI * beatNoteFreq * t) + 0.3 * Math.sin(2 * Math.PI * beatNoteFreq * 2 * t)) * envelope * 0.3;
          leftChannel[beatStartSample + s] += sampleVal;
          rightChannel[beatStartSample + s] += sampleVal * 0.85;
        }
      }

      if (this.loops.has(trackId)) {
        try {
          const old = this.loops.get(trackId);
          old?.stop();
          old?.dispose();
        } catch (e) {}
      }
      const toneBuffer = new Tone.ToneAudioBuffer(buffer);
      const player = new Tone.Player({
        url: toneBuffer,
        loop: true,
        autostart: true,
      }).toDestination();
      player.volume.value = volume;
      this.loops.set(trackId, player);
    } catch (e) {
      console.warn("Could not create synthesized loop buffer:", e);
    }
  }

  public playLoopTrack(trackId: string, durationSec: number = 10, volume: number = -6): void {
    if (this.loops.has(trackId)) {
      const player = this.loops.get(trackId);
      if (player) {
        if (player.state !== 'started') {
          player.start();
        }
        return;
      }
    }
    this.createFallbackLoop(trackId, durationSec, volume);
  }

  public hasLoop(trackId: string): boolean {
    return this.loops.has(trackId);
  }

  public stopTrack(trackId: string): void {
    if (this.loops.has(trackId)) {
      this.loops.get(trackId)?.stop();
    }
  }

  public stopAll(): void {
    this.loops.forEach(player => player.stop());
  }

  public setVolume(trackId: string, volume: number, isMuted: boolean = false): void {
    const val = isMuted ? -Infinity : volume;
    if (this.synths.has(trackId)) {
      const s = this.synths.get(trackId);
      if (s && s.volume) s.volume.value = val;
    }
    if (this.loops.has(trackId)) {
      const p = this.loops.get(trackId);
      if (p && p.volume) p.volume.value = val;
    }
    if (this.drumPatterns.has(trackId)) {
      const d = this.drumPatterns.get(trackId);
      if (d) {
        d.kick.volume.value = val;
        d.snare.volume.value = val - 4;
        d.hat.volume.value = val - 8;
      }
    }
  }

  public previewPreset(presetId: string): void {
    try {
      const preset = PRESET_OPTIONS.find(p => p.id === presetId);
      if (!preset) return;

      if (preset.category === 'instrument') {
        const tempSynth = new Tone.PolySynth(Tone.Synth).toDestination();
        tempSynth.volume.value = -8;
        const notes = preset.defaultNotes || ['C4', 'E4', 'G4', 'B4'];
        tempSynth.triggerAttackRelease(notes, '4n');
        setTimeout(() => tempSynth.dispose(), 1000);
      } else if (preset.category === 'sample') {
        const kick = new Tone.MembraneSynth().toDestination();
        const snare = new Tone.NoiseSynth().toDestination();
        const hat = new Tone.MetalSynth().toDestination();
        kick.volume.value = -6;
        snare.volume.value = -10;
        hat.volume.value = -12;
        const now = Tone.now() + 0.01;
        kick.triggerAttackRelease('C1', '8n', now);
        snare.triggerAttackRelease('8n', now + 0.2);
        hat.triggerAttackRelease('16n', now + 0.35);
        setTimeout(() => {
          try { kick.dispose(); } catch (e) {}
          try { snare.dispose(); } catch (e) {}
          try { hat.dispose(); } catch (e) {}
        }, 1000);
      }
    } catch (e) {
      console.warn("Error previewing preset:", e);
    }
  }

  public disposeTrack(trackId: string): void {
    if (this.synths.has(trackId)) {
      try { this.synths.get(trackId)?.dispose(); } catch (e) {}
      this.synths.delete(trackId);
    }
    if (this.loops.has(trackId)) {
      try { this.loops.get(trackId)?.dispose(); } catch (e) {}
      this.loops.delete(trackId);
    }
    if (this.drumPatterns.has(trackId)) {
      const d = this.drumPatterns.get(trackId);
      if (d) {
        try { d.kick.dispose(); } catch (e) {}
        try { d.snare.dispose(); } catch (e) {}
        try { d.hat.dispose(); } catch (e) {}
      }
      this.drumPatterns.delete(trackId);
    }
  }

  public cleanup(): void {
    this.synths.forEach(s => { try { s.dispose(); } catch (e) {} });
    this.loops.forEach(l => { try { l.dispose(); } catch (e) {} });
    this.drumPatterns.forEach(d => {
      try { d.kick.dispose(); } catch (e) {}
      try { d.snare.dispose(); } catch (e) {}
      try { d.hat.dispose(); } catch (e) {}
    });
    this.synths.clear();
    this.loops.clear();
    this.drumPatterns.clear();
  }
}

export const globalAudioEngine = new AudioEngine();
