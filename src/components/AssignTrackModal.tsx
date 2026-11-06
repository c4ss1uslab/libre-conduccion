import React, { useState } from 'react';
import { TrackData } from '../types';
import { PRESET_OPTIONS, GESTURE_OPTIONS, globalAudioEngine } from '../lib/audioEngine';
import { X, Plus, Volume2, Music, Radio, Mic, Sparkles, Check, Play, VolumeX } from 'lucide-react';
import { cn } from '../lib/utils';

interface AssignTrackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssignTrack: (newTrack: TrackData) => void;
  existingTracksCount: number;
}

export function AssignTrackModal({
  isOpen,
  onClose,
  onAssignTrack,
  existingTracksCount,
}: AssignTrackModalProps) {
  const [trackType, setTrackType] = useState<'instrument' | 'sample' | 'loop'>('instrument');
  const [selectedPreset, setSelectedPreset] = useState<string>('poly_synth');
  const [trackName, setTrackName] = useState<string>('PolySynth Chords');
  const [assignedGesture, setAssignedGesture] = useState<string>('Peace Sign');
  const [volume, setVolume] = useState<number>(-6);
  const [loopDuration, setLoopDuration] = useState<number>(10);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  if (!isOpen) return null;

  const handleTypeChange = (type: 'instrument' | 'sample' | 'loop') => {
    setTrackType(type);
    const presetsForType = PRESET_OPTIONS.filter(p => p.category === type);
    if (presetsForType.length > 0) {
      const defaultPreset = presetsForType[0];
      setSelectedPreset(defaultPreset.id);
      setTrackName(defaultPreset.name);
    }
  };

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = PRESET_OPTIONS.find(p => p.id === presetId);
    if (preset) {
      setTrackName(preset.name);
    }
  };

  const handlePreviewSound = () => {
    setIsPlayingPreview(true);
    globalAudioEngine.previewPreset(selectedPreset);
    setTimeout(() => setIsPlayingPreview(false), 800);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newTrack: TrackData = {
      id: String(Date.now()).slice(-4),
      name: trackName.trim() || `Track ${existingTracksCount + 1}`,
      type: trackType,
      status: 'idle',
      volume: volume,
      preset: selectedPreset,
      assignedGesture: assignedGesture === 'Manual Only' ? undefined : assignedGesture,
      loopDuration: trackType === 'loop' ? loopDuration : undefined,
      muted: false,
    };
    onAssignTrack(newTrack);
    onClose();
  };

  const currentPresets = PRESET_OPTIONS.filter(p => p.category === trackType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-track-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h2 id="assign-track-title" className="text-sm font-bold uppercase tracking-wider text-white">
                Assign New Audio Track
              </h2>
              <p className="text-[10px] text-zinc-400 font-mono">
                Configure live audio routing & gesture triggers
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
            id="close-assign-track-modal-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* 1. Track Type Selection */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              1. Select Track Engine Type
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { type: 'instrument' as const, label: 'Instrument', desc: 'Synthesizers & Pads', icon: Music },
                { type: 'sample' as const, label: 'Drum Pattern', desc: 'Rhythms & Grooves', icon: Radio },
                { type: 'loop' as const, label: 'Mic Looper', desc: 'Live Acoustic Buffer', icon: Mic },
              ].map(item => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => handleTypeChange(item.type)}
                  className={cn(
                    "flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer",
                    trackType === item.type 
                      ? "bg-indigo-600/15 border-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.2)]" 
                      : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  )}
                >
                  <item.icon className={cn("w-4 h-4 mb-2", trackType === item.type ? "text-indigo-400" : "text-zinc-500")} />
                  <span className="text-xs font-bold uppercase">{item.label}</span>
                  <span className="text-[9px] text-zinc-500 font-mono mt-0.5 leading-tight">{item.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Preset Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                2. Sound Preset / Architecture
              </label>
              {trackType !== 'loop' && (
                <button
                  type="button"
                  onClick={handlePreviewSound}
                  disabled={isPlayingPreview}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 cursor-pointer"
                >
                  <Play className={cn("w-3 h-3", isPlayingPreview && "animate-spin")} />
                  {isPlayingPreview ? "Testing..." : "Preview Sound"}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 max-h-36 overflow-y-auto pr-1">
              {currentPresets.map(preset => (
                <div
                  key={preset.id}
                  onClick={() => handlePresetChange(preset.id)}
                  className={cn(
                    "flex items-center justify-between p-2.5 px-3 rounded-lg border text-left cursor-pointer transition-all",
                    selectedPreset === preset.id
                      ? "bg-zinc-900 border-indigo-500 text-white"
                      : "bg-zinc-900/40 border-zinc-800/80 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/70"
                  )}
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-2">
                      {preset.name}
                      {selectedPreset === preset.id && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">{preset.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Track Name & Gesture Assignment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                3. Track Display Name
              </label>
              <input
                type="text"
                value={trackName}
                onChange={e => setTrackName(e.target.value)}
                placeholder="e.g. Lead Synth"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 uppercase"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                4. Conductor Gesture Trigger
              </label>
              <select
                value={assignedGesture}
                onChange={e => setAssignedGesture(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              >
                {GESTURE_OPTIONS.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4. Volume & Parameters */}
          <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[10px] font-bold uppercase text-zinc-400 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-zinc-400" /> Initial Gain Level
              </span>
              <span className="font-mono text-[10px] text-indigo-400 font-bold">
                {volume === -24 ? '-inf' : `${volume > 0 ? `+${volume}` : volume} dB`}
              </span>
            </div>
            <input
              type="range"
              min="-24"
              max="6"
              step="1"
              value={volume}
              onChange={e => setVolume(Number(e.target.value))}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />

            {trackType === 'loop' && (
              <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Loop Duration Limit</span>
                <div className="flex gap-1.5">
                  {[5, 8, 10, 16].map(sec => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setLoopDuration(sec)}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer",
                        loopDuration === sec 
                          ? "bg-indigo-600 text-white border-indigo-500" 
                          : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                      )}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold uppercase tracking-wider border border-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors shadow-lg shadow-indigo-600/20 cursor-pointer"
              id="confirm-assign-track-btn"
            >
              <Plus className="w-4 h-4" /> Assign Track to Rack
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
