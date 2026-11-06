import React, { useState, useRef, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
const WebcamComponent = Webcam as any;
import * as Tone from 'tone';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { TrackData } from '../types';
import { AssignTrackModal } from '../components/AssignTrackModal';
import { globalAudioEngine, PRESET_OPTIONS } from '../lib/audioEngine';
import { 
  Play, 
  Square, 
  Mic, 
  Radio, 
  Hand, 
  Plus, 
  Activity, 
  Camera, 
  VideoOff, 
  Cpu, 
  Volume2, 
  VolumeX, 
  Trash2, 
  Music, 
  Sparkles,
  Sliders,
  CheckCircle2
} from 'lucide-react';
import { cn } from '../lib/utils';

interface FingersState {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

const getDistance = (p1: any, p2: any) => {
  if (!p1 || !p2) return 0;
  return Math.sqrt(
    Math.pow(p1.x - p2.x, 2) +
    Math.pow(p1.y - p2.y, 2) +
    Math.pow(p1.z - p2.z, 2)
  );
};

export function ConductionRoom() {
  const { user } = useAuth();
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastDetectionTimestampRef = useRef<number>(0);
  const lastTriggerTimeRef = useRef<number>(0);
  
  const [isAudioReady, setIsAudioReady] = useState(false);
  const isAudioReadyRef = useRef(false);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const isCameraOnRef = useRef(true);
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [recordingTimeLeft, setRecordingTimeLeft] = useState<number>(10);
  const [activeRecordingTrackId, setActiveRecordingTrackId] = useState<string | null>(null);

  // Modal State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  const [fingersState, setFingersState] = useState<FingersState>({
    thumb: false,
    index: false,
    middle: false,
    ring: false,
    pinky: false
  });
  const lastFingersStateRef = useRef<FingersState>({
    thumb: false,
    index: false,
    middle: false,
    ring: false,
    pinky: false
  });
  const gestureCandidateRef = useRef<string | null>(null);
  const gestureConsecutiveFramesRef = useRef<number>(0);

  const micStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const loopStartTimesRef = useRef<Record<string, number>>({});
  const [loopProgress, setLoopProgress] = useState<Record<string, { secondsLeft: number; percent: number }>>({});
  const recordingTimeoutRef = useRef<any>(null);
  const recordingIntervalRef = useRef<any>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const activeRecordingTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    isCameraOnRef.current = isCameraOn;
  }, [isCameraOn]);

  const [tracks, setTracks] = useState<TrackData[]>([
    { id: '1', name: 'Mic Loop 1 (Main Voice)', type: 'loop', status: 'idle', volume: -6, preset: 'mic_loop_10s', assignedGesture: 'Open Palm', loopDuration: 10 },
    { id: '2', name: 'Mic Loop 2 (Vocal Chops)', type: 'loop', status: 'idle', volume: -6, preset: 'mic_loop_5s', assignedGesture: 'Thumbs Up', loopDuration: 5 },
    { id: '3', name: 'Mic Loop 3 (Beatbox/Rhythm)', type: 'loop', status: 'idle', volume: -6, preset: 'mic_loop_10s', assignedGesture: 'Rock On', loopDuration: 10 },
    { id: '4', name: 'Mic Loop 4 (Harmonies)', type: 'loop', status: 'idle', volume: -6, preset: 'mic_loop_5s', assignedGesture: 'Call Me', loopDuration: 5 },
    { id: '5', name: 'Mic Loop 5 (Acoustic FX)', type: 'loop', status: 'idle', volume: -6, preset: 'mic_loop_16s', assignedGesture: 'Three Fingers', loopDuration: 16 },
    { id: '6', name: 'Mic Loop 6 (Percussion)', type: 'loop', status: 'idle', volume: -6, preset: 'mic_loop_10s', assignedGesture: 'Manual Only', loopDuration: 10 },
    { id: '7', name: 'Mic Loop 7 (Atmosphere)', type: 'loop', status: 'idle', volume: -6, preset: 'mic_loop_5s', assignedGesture: 'Manual Only', loopDuration: 5 },
    { id: '8', name: 'Mic Loop 8 (Bass Vocal)', type: 'loop', status: 'idle', volume: -6, preset: 'mic_loop_10s', assignedGesture: 'Manual Only', loopDuration: 10 },
    { id: '9', name: 'Mic Loop 9 (Ad-libs)', type: 'loop', status: 'idle', volume: -6, preset: 'mic_loop_5s', assignedGesture: 'Manual Only', loopDuration: 5 },
    { id: '10', name: 'PolySynth Chords', type: 'instrument', status: 'idle', volume: -8, preset: 'poly_synth', assignedGesture: 'Point Up' },
    { id: '11', name: '808 Trap Groove', type: 'sample', status: 'idle', volume: -6, preset: 'beat_808', assignedGesture: 'Peace Sign' },
    { id: '12', name: 'Cyberpunk FM Lead', type: 'instrument', status: 'idle', volume: -10, preset: 'fm_lead', assignedGesture: 'Manual Only' },
  ]);
  const tracksRef = useRef<TrackData[]>(tracks);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  // Smooth live duration progress for looping tracks
  useEffect(() => {
    let animId: number;
    const updateLoopTimers = () => {
      const playingLoops = tracks.filter(t => t.type === 'loop' && t.status === 'playing');
      if (playingLoops.length > 0) {
        const now = performance.now();
        const progressMap: Record<string, { secondsLeft: number; percent: number }> = {};

        playingLoops.forEach(track => {
          if (!loopStartTimesRef.current[track.id]) {
            loopStartTimesRef.current[track.id] = now;
          }
          const startTime = loopStartTimesRef.current[track.id];
          const duration = track.loopDuration || 10;
          const elapsedSec = (now - startTime) / 1000;
          const currentCycleSec = elapsedSec % duration;
          const secondsLeft = Math.max(0, duration - currentCycleSec);
          const percent = Math.min(100, Math.max(0, (currentCycleSec / duration) * 100));

          progressMap[track.id] = { secondsLeft, percent };
        });
        setLoopProgress(progressMap);
      } else {
        setLoopProgress({});
      }
      animId = requestAnimationFrame(updateLoopTimers);
    };

    animId = requestAnimationFrame(updateLoopTimers);
    return () => cancelAnimationFrame(animId);
  }, [tracks]);

  const [activeGesture, setActiveGesture] = useState<string | null>(null);
  const [sessionStartTime] = useState(Date.now());
  const [stats, setStats] = useState({ gestures: 0, loops: 0 });

  useEffect(() => {
    isAudioReadyRef.current = isAudioReady;
  }, [isAudioReady]);

  // Initialize MediaPipe Vision HandLandmarker
  useEffect(() => {
    let isMounted = true;
    async function initMediaPipe() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        if (isMounted) {
          handLandmarkerRef.current = landmarker;
          lastDetectionTimestampRef.current = Math.max(lastDetectionTimestampRef.current, Math.round(performance.now()));
          lastVideoTimeRef.current = -1;
          setIsModelLoading(false);
          setModelError(null);
        }
      } catch (err) {
        console.error("Error initializing MediaPipe:", err);
        if (isMounted) {
          setModelError(err instanceof Error ? err.message : String(err));
          setIsModelLoading(false);
        }
      }
    }
    initMediaPipe();

    return () => {
      isMounted = false;
      handLandmarkerRef.current?.close();
    };
  }, []);

  // Initialize Audio tracks & audio engine
  useEffect(() => {
    tracks.forEach(track => {
      globalAudioEngine.registerTrack(track);
    });

    return () => {
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try { mediaRecorderRef.current.stop(); } catch (e) {}
      }
      globalAudioEngine.cleanup();
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (user) {
        // Save session on unmount
        addDoc(collection(db, 'sessions'), {
          userId: user.uid,
          startTime: sessionStartTime,
          endTime: Date.now(),
          duration: Date.now() - sessionStartTime,
          gesturesRecognized: stats.gestures,
          loopsRecorded: stats.loops,
        }).catch(console.error);
      }
    };
  }, [user, sessionStartTime]);

  const initAudio = async () => {
    try {
      await globalAudioEngine.initialize();
      console.log("Audio Engine context initialized");
      
      // Request microphone permission to capture real mic loop audio
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Microphone access granted successfully");
      micStreamRef.current = stream;
      setMicPermission('granted');
      setIsAudioReady(true);
    } catch (err) {
      console.error("Error accessing microphone or starting audio engine:", err);
      setMicPermission('denied');
      setIsAudioReady(true); // Proceed with audio synth playback
    }
  };

  const handleAssignTrack = (newTrack: TrackData) => {
    // Register audio engine node
    globalAudioEngine.registerTrack(newTrack);
    setTracks(prev => [...prev, newTrack]);
  };

  const handleDeleteTrack = (trackId: string) => {
    globalAudioEngine.disposeTrack(trackId);
    delete loopStartTimesRef.current[trackId];
    setTracks(prev => prev.filter(t => t.id !== trackId));
  };

  const handleVolumeChange = (trackId: string, volume: number) => {
    setTracks(prev => prev.map(t => {
      if (t.id === trackId) {
        globalAudioEngine.setVolume(trackId, volume, t.muted);
        return { ...t, volume };
      }
      return t;
    }));
  };

  const handleToggleMute = (trackId: string) => {
    setTracks(prev => prev.map(t => {
      if (t.id === trackId) {
        const nextMuted = !t.muted;
        globalAudioEngine.setVolume(trackId, t.volume, nextMuted);
        return { ...t, muted: nextMuted };
      }
      return t;
    }));
  };

  const finishRecording = useCallback((trackId: string) => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    const startTime = recordingStartTimeRef.current || performance.now();
    const elapsedSec = Math.max(0.4, (performance.now() - startTime) / 1000);
    const currentTrack = tracksRef.current.find(t => t.id === trackId);
    const maxDuration = currentTrack?.loopDuration || 10;
    const actualDuration = Math.min(maxDuration, Math.round(elapsedSec * 10) / 10);

    // Update track duration to actual duration and status to playing
    setTracks(currentTracks => currentTracks.map(t => {
      if (t.id === trackId) {
        return { 
          ...t, 
          status: 'playing', 
          loopDuration: actualDuration 
        };
      }
      return t;
    }));

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      try {
        recorder.stop();
      } catch (e) {
        console.warn("Error stopping recorder:", e);
      }
    } else {
      // Fallback: start loop player with synthesized audio buffer of exact recorded duration
      globalAudioEngine.createFallbackLoop(trackId, actualDuration, currentTrack?.volume ?? -6);
    }

    loopStartTimesRef.current[trackId] = performance.now();
    setActiveRecordingTrackId(null);
    activeRecordingTrackIdRef.current = null;
    setRecordingTimeLeft(0);
  }, []);

  const recordMicLoop = useCallback((trackId: string, durationSec: number = 10) => {
    // If another track was recording, finish it early and save it
    if (activeRecordingTrackIdRef.current && activeRecordingTrackIdRef.current !== trackId) {
      finishRecording(activeRecordingTrackIdRef.current);
    }

    setStats(s => ({ ...s, loops: s.loops + 1 }));
    setActiveRecordingTrackId(trackId);
    activeRecordingTrackIdRef.current = trackId;
    setRecordingTimeLeft(durationSec);
    recordingStartTimeRef.current = performance.now();
    delete loopStartTimesRef.current[trackId];

    // Set track status to recording
    setTracks(currentTracks => currentTracks.map(t => t.id === trackId ? { ...t, status: 'recording' } : t));

    // Gesture cooldown to prevent rapid same-frame re-trigger
    lastTriggerTimeRef.current = Date.now();

    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);

    // Countdown interval
    recordingIntervalRef.current = setInterval(() => {
      setRecordingTimeLeft(prev => {
        if (prev <= 0.1) {
          if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
            recordingIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);

    let recorder: MediaRecorder | null = null;
    if (micStreamRef.current) {
      try {
        audioChunksRef.current = [];
        recorder = new MediaRecorder(micStreamRef.current);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };
        recorder.onstop = () => {
          if (audioChunksRef.current.length > 0) {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(blob);
            const currentTrack = tracksRef.current.find(t => t.id === trackId);
            globalAudioEngine.setLoopPlayer(trackId, audioUrl, currentTrack?.volume ?? -6);
          } else {
            const currentTrack = tracksRef.current.find(t => t.id === trackId);
            globalAudioEngine.createFallbackLoop(trackId, currentTrack?.loopDuration || durationSec, currentTrack?.volume ?? -6);
          }
        };
        recorder.start();
      } catch (err) {
        console.error("Failed to start MediaRecorder:", err);
      }
    }

    // Schedule maximum duration finish
    recordingTimeoutRef.current = setTimeout(() => {
      finishRecording(trackId);
    }, durationSec * 1000);
  }, [finishRecording]);

  const simulateGesture = useCallback((gestureName: string, actionOverride?: string, targetIdOverride?: string) => {
    if (!isAudioReadyRef.current) {
      initAudio();
    }
    setActiveGesture(gestureName);
    setStats(s => ({ ...s, gestures: s.gestures + 1 }));

    // Stop single track
    if (actionOverride === 'stop_single' && targetIdOverride) {
      if (activeRecordingTrackIdRef.current === targetIdOverride) {
        // If user explicitly stops a currently recording track via stop button, finish early and play
        finishRecording(targetIdOverride);
      } else {
        globalAudioEngine.stopTrack(targetIdOverride);
        delete loopStartTimesRef.current[targetIdOverride];
        setTracks(ts => ts.map(t => t.id === targetIdOverride ? { ...t, status: 'idle' } : t));
      }
      return;
    }

    // Fist always stops all tracks
    if (gestureName === 'Fist' || actionOverride === 'stop_all') {
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try { mediaRecorderRef.current.stop(); } catch (e) {}
      }
      globalAudioEngine.stopAll();
      loopStartTimesRef.current = {};
      setTracks(ts => ts.map(t => ({ ...t, status: 'idle' })));
      setActiveRecordingTrackId(null);
      activeRecordingTrackIdRef.current = null;
      setTimeout(() => setActiveGesture(null), 1000);
      return;
    }

    // Find track explicitly bound to this gesture, or use targetIdOverride
    const currentTracks = tracksRef.current;
    let targetTrack: TrackData | undefined;
    
    if (targetIdOverride) {
      targetTrack = currentTracks.find(t => t.id === targetIdOverride);
    } else {
      targetTrack = currentTracks.find(t => t.assignedGesture === gestureName);
    }

    // Fallback default routing if not found
    if (!targetTrack) {
      if (gestureName === 'Open Palm') targetTrack = currentTracks.find(t => t.type === 'loop');
      else if (gestureName === 'Point Up') targetTrack = currentTracks.find(t => t.type === 'instrument');
      else if (gestureName === 'Peace Sign') targetTrack = currentTracks.find(t => t.type === 'sample');
    }

    if (targetTrack) {
      if (targetTrack.type === 'instrument') {
        setTracks(ts => ts.map(t => t.id === targetTrack!.id ? { ...t, status: 'playing' } : t));
        globalAudioEngine.playInstrumentTrack(targetTrack);
        setTimeout(() => {
          setTracks(ts => ts.map(t => t.id === targetTrack!.id ? { ...t, status: 'idle' } : t));
        }, 600);
      } else if (targetTrack.type === 'sample') {
        setTracks(ts => ts.map(t => t.id === targetTrack!.id ? { ...t, status: 'playing' } : t));
        globalAudioEngine.playSampleTrack(targetTrack);
        setTimeout(() => {
          setTracks(ts => ts.map(t => t.id === targetTrack!.id ? { ...t, status: 'idle' } : t));
        }, 600);
      } else if (targetTrack.type === 'loop') {
        const isRec = targetTrack.status === 'recording' || activeRecordingTrackIdRef.current === targetTrack.id;

        if (actionOverride === 'play' || actionOverride === 'play_loop') {
          if (isRec) {
            // Clicking play or triggering play while recording finishes early and starts loop
            finishRecording(targetTrack.id);
          } else {
            globalAudioEngine.playLoopTrack(targetTrack.id, targetTrack.loopDuration || 10, targetTrack.volume ?? -6);
            loopStartTimesRef.current[targetTrack.id] = performance.now();
            setTracks(ts => ts.map(t => t.id === targetTrack!.id ? { ...t, status: 'playing' } : t));
          }
        } else {
          // Record action or assigned gesture trigger
          if (isRec) {
            // Showing assigned gesture or clicking record while recording ends it early and saves/plays it!
            finishRecording(targetTrack.id);
          } else {
            recordMicLoop(targetTrack.id, targetTrack.loopDuration || 10);
          }
        }
      }
    }

    setTimeout(() => setActiveGesture(null), 1000);
  }, [initAudio, recordMicLoop, finishRecording]);

  const predictWebcam = useCallback(() => {
    if (!isCameraOnRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }
    const video = webcamRef.current?.video;
    const canvas = canvasRef.current;
    const landmarker = handLandmarkerRef.current;

    if (!video || !canvas || !landmarker) {
      return;
    }

    if (video.readyState >= 2) {
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (lastVideoTimeRef.current !== video.currentTime) {
          lastVideoTimeRef.current = video.currentTime;
          
          const currentPerfNow = Math.round(performance.now());
          const startTimeMs = Math.max(currentPerfNow, (lastDetectionTimestampRef.current || 0) + 1);
          lastDetectionTimestampRef.current = startTimeMs;

          let results: any = null;
          try {
            results = landmarker.detectForVideo(video, startTimeMs);
          } catch (detectionErr) {
            // If a timestamp collision or frame skip occurred in MediaPipe WASM, advance the timestamp safely
            lastDetectionTimestampRef.current += 35;
            return;
          }
          
          if (results && results.landmarks && results.landmarks.length > 0) {
            // Draw landmarks
            for (const landmarks of results.landmarks) {
              for (let i = 0; i < landmarks.length; i++) {
                const x = landmarks[i].x * canvas.width;
                const y = landmarks[i].y * canvas.height;
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, 2 * Math.PI);
                ctx.fillStyle = '#4f46e5'; // indigo-600
                ctx.fill();
              }
              
              // Draw connections wireframe
              ctx.strokeStyle = '#6366f1';
              ctx.lineWidth = 2;
              const connections = [
                [0, 1, 2, 3, 4],
                [0, 5, 6, 7, 8],
                [9, 10, 11, 12],
                [13, 14, 15, 16],
                [17, 18, 19, 20],
                [5, 9, 13, 17, 0]
              ];
              
              for (const connection of connections) {
                ctx.beginPath();
                for (let i = 0; i < connection.length; i++) {
                  const idx = connection[i];
                  const x = landmarks[idx].x * canvas.width;
                  const y = landmarks[idx].y * canvas.height;
                  if (i === 0) ctx.moveTo(x, y);
                  else ctx.lineTo(x, y);
                }
                ctx.stroke();
              }
            }

            // High Precision rotation-invariant Gesture Detection
            const landmarks = results.landmarks[0];
            
            const isFingerExtended = (tipIdx: number, pipIdx: number, mcpIdx: number) => {
              const dTipMcp = getDistance(landmarks[tipIdx], landmarks[mcpIdx]);
              const dPipMcp = getDistance(landmarks[pipIdx], landmarks[mcpIdx]);
              const dTipWrist = getDistance(landmarks[tipIdx], landmarks[0]);
              const dPipWrist = getDistance(landmarks[pipIdx], landmarks[0]);
              return (dTipMcp > dPipMcp * 1.35) && (dTipWrist > dPipWrist * 1.15);
            };

            const indexUp = isFingerExtended(8, 6, 5);
            const middleUp = isFingerExtended(12, 10, 9);
            const ringUp = isFingerExtended(16, 14, 13);
            const pinkyUp = isFingerExtended(20, 18, 17);

            const dTipMcp = getDistance(landmarks[4], landmarks[2]);
            const dTipIp = getDistance(landmarks[4], landmarks[3]);
            const dIpMcp = getDistance(landmarks[3], landmarks[2]);
            const thumbStraightness = dTipMcp / (dTipIp + dIpMcp);
            const isThumbStraight = thumbStraightness > 0.88;

            const dTipIndexMcp = getDistance(landmarks[4], landmarks[5]);
            const dMcpIndexMcp = getDistance(landmarks[2], landmarks[5]);
            const thumbOutwardRatio = dTipIndexMcp / dMcpIndexMcp;

            const dTipPinkyMcp = getDistance(landmarks[4], landmarks[17]);
            const dMcpPinkyMcp = getDistance(landmarks[2], landmarks[17]);
            const thumbAwayFromPinkyRatio = dTipPinkyMcp / dMcpPinkyMcp;

            const thumbUp = isThumbStraight && (thumbOutwardRatio > 1.15) && (thumbAwayFromPinkyRatio > 1.02);

            const currentFingers = { thumb: thumbUp, index: indexUp, middle: middleUp, ring: ringUp, pinky: pinkyUp };
            if (
              currentFingers.thumb !== lastFingersStateRef.current.thumb ||
              currentFingers.index !== lastFingersStateRef.current.index ||
              currentFingers.middle !== lastFingersStateRef.current.middle ||
              currentFingers.ring !== lastFingersStateRef.current.ring ||
              currentFingers.pinky !== lastFingersStateRef.current.pinky
            ) {
              lastFingersStateRef.current = currentFingers;
              setFingersState(currentFingers);
            }

            // Determine current gesture candidate
            let gesture: string | null = null;
            if (indexUp && middleUp && ringUp && pinkyUp) {
              gesture = 'Open Palm';
            } else if (indexUp && middleUp && !ringUp && !pinkyUp) {
              gesture = 'Peace Sign';
            } else if (indexUp && !middleUp && !ringUp && pinkyUp) {
              gesture = 'Rock On';
            } else if (thumbUp && !indexUp && !middleUp && !ringUp && !pinkyUp) {
              gesture = 'Thumbs Up';
            } else if (thumbUp && !indexUp && !middleUp && !ringUp && pinkyUp) {
              gesture = 'Call Me';
            } else if (indexUp && middleUp && ringUp && !pinkyUp) {
              gesture = 'Three Fingers';
            } else if (indexUp && !middleUp && !ringUp && !pinkyUp) {
              gesture = 'Point Up';
            } else if (!indexUp && !middleUp && !ringUp && !pinkyUp) {
              gesture = 'Fist';
            }

            if (gesture) {
              if (gesture === gestureCandidateRef.current) {
                gestureConsecutiveFramesRef.current += 1;
              } else {
                gestureCandidateRef.current = gesture;
                gestureConsecutiveFramesRef.current = 1;
              }

              // Fire if held consistently for 4 consecutive frames
              if (gestureConsecutiveFramesRef.current >= 4) {
                const now = Date.now();
                if (now - lastTriggerTimeRef.current > 900) {
                  lastTriggerTimeRef.current = now;
                  simulateGesture(gesture);
                }
              }
            } else {
              gestureCandidateRef.current = null;
              gestureConsecutiveFramesRef.current = 0;
            }
          } else {
            const noFingers = { thumb: false, index: false, middle: false, ring: false, pinky: false };
            if (
              noFingers.thumb !== lastFingersStateRef.current.thumb ||
              noFingers.index !== lastFingersStateRef.current.index ||
              noFingers.middle !== lastFingersStateRef.current.middle ||
              noFingers.ring !== lastFingersStateRef.current.ring ||
              noFingers.pinky !== lastFingersStateRef.current.pinky
            ) {
              lastFingersStateRef.current = noFingers;
              setFingersState(noFingers);
            }
            gestureCandidateRef.current = null;
            gestureConsecutiveFramesRef.current = 0;
          }
        }
      }
    }
  }, [simulateGesture]);

  const predictRef = useRef<() => void>(undefined);
  useEffect(() => {
    predictRef.current = predictWebcam;
  }, [predictWebcam]);

  useEffect(() => {
    let active = true;
    const loop = () => {
      if (!active) return;
      predictRef.current?.();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Assign Track Modal */}
      <AssignTrackModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        onAssignTrack={handleAssignTrack}
        existingTracksCount={tracks.length}
      />

      {/* Top Section: Spacious Camera View (Left, col-span-8) & Vertical Conductor Sidebar (Right, col-span-4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        
        {/* Spacious Camera View */}
        <div className="lg:col-span-8 bg-zinc-900 rounded-2xl overflow-hidden relative border border-zinc-800 shadow-2xl flex items-center justify-center aspect-video min-h-[300px] max-h-[460px] w-full">
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 z-10 pointer-events-none" />
          
          {isCameraOn ? (
            <WebcamComponent 
              ref={webcamRef}
              mirrored={true}
              audio={false}
              videoConstraints={{
                facingMode: "user",
              }}
              className="absolute inset-0 w-full h-full object-cover opacity-80"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 text-zinc-500 z-0">
              <VideoOff className="w-10 h-10 text-zinc-700 mb-2 animate-pulse" />
              <p className="text-xs uppercase tracking-wider font-mono">Camera Feed Offline</p>
              <button 
                onClick={() => setIsCameraOn(true)}
                className="mt-3 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-indigo-600/30"
              >
                Turn Camera On
              </button>
            </div>
          )}
          
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10 scale-x-[-1]"
          />
          
          {/* Tracking Overlay UI */}
          <div className="absolute inset-0 z-20 pointer-events-none p-4 flex flex-col justify-between">
            {/* Overlay Header: Badges & Vanishing Toggle Icons */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 bg-black/60 rounded text-[10px] font-mono border border-zinc-700 text-zinc-300">
                CAM_01: WIDE_ANGLE
              </span>
              
              <span className={cn(
                "px-2.5 py-1 rounded text-[10px] font-mono border flex items-center gap-1.5",
                modelError 
                  ? "bg-rose-950/80 text-rose-300 border-rose-700/50" 
                  : isModelLoading 
                  ? "bg-amber-950/80 text-amber-300 border-amber-700/50 animate-pulse" 
                  : "bg-emerald-950/80 text-emerald-300 border-emerald-700/50"
              )}>
                <span className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  modelError ? "bg-rose-400" : isModelLoading ? "bg-amber-400" : "bg-emerald-400 shadow-[0_0_8px_#34d399]"
                )} />
                {modelError ? "TRACKING: ERROR" : isModelLoading ? "LOADING MODEL..." : "TRACKING: ACTIVE"}
              </span>

              {/* Small Camera Turn On button beside tracking status - vanishes once camera is turned on */}
              {!isCameraOn && (
                <button
                  onClick={() => setIsCameraOn(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-mono font-bold uppercase tracking-wider border border-indigo-400/50 transition-all pointer-events-auto cursor-pointer shadow-lg shadow-indigo-600/40 animate-pulse"
                  title="Click to turn on Camera"
                  id="overlay-turn-on-camera-btn"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Turn On Cam</span>
                </button>
              )}

              {/* Small Audio/Mic Turn On button beside tracking status - vanishes once audio is ready */}
              {!isAudioReady && (
                <button
                  onClick={initAudio}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-mono font-bold uppercase tracking-wider border border-rose-400/50 transition-all pointer-events-auto cursor-pointer shadow-lg shadow-rose-600/40 animate-pulse"
                  title="Click to turn on Audio & Mic"
                  id="overlay-turn-on-audio-btn"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Turn On Audio/Mic</span>
                </button>
              )}

              {/* Subtle Camera Off toggle when camera is on */}
              {isCameraOn && (
                <button
                  onClick={() => setIsCameraOn(false)}
                  className="p-1.5 bg-black/50 hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 rounded-lg border border-zinc-700/60 transition-colors pointer-events-auto cursor-pointer ml-auto"
                  title="Turn Camera Off"
                  id="overlay-turn-off-camera-btn"
                >
                  <VideoOff className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Active Gesture Detection Feedback in Center */}
            <div className="flex justify-center text-center pb-3">
              {activeGesture ? (
                <div className="animate-in fade-in slide-in-from-bottom-2 bg-black/70 backdrop-blur-md px-5 py-2 rounded-2xl border border-indigo-500/40 shadow-xl shadow-indigo-500/20">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-400 mb-0.5">Command Detected</div>
                  <div className="text-2xl md:text-3xl font-black italic tracking-tight text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">
                    {activeGesture}
                  </div>
                </div>
              ) : (
                <div className="h-12" />
              )}
            </div>
          </div>
        </div>

        {/* Right: Vertical Conductor Overview Sidebar (col-span-4) */}
        <div className="lg:col-span-4 bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between shadow-xl">
          <div className="space-y-3.5">
            {/* Compact Session Metrics Row */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Metrics:</span>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-mono text-[11px] font-bold">
                  <span className="text-zinc-500 font-normal">Gestures:</span> {stats.gestures}
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-300 font-mono text-[11px] font-bold">
                  <span className="text-zinc-500 font-normal">Loops:</span> {stats.loops}
                </div>
              </div>

              {/* Master Stop All Button */}
              <button
                onClick={() => simulateGesture('Fist')}
                className="flex items-center gap-1 px-2.5 py-1 bg-zinc-900 hover:bg-rose-950/50 text-zinc-300 hover:text-rose-300 border border-zinc-800 hover:border-rose-500/40 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer"
                title="Stop All Playing & Recording Tracks (✊ Fist)"
                id="master-stop-btn"
              >
                <Square className="w-3 h-3 fill-current text-rose-400" />
                <span>Stop All (✊)</span>
              </button>
            </div>

            {/* Live Finger Tracker */}
            <div className="pb-3 border-b border-zinc-800/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-indigo-400" /> Finger Tracking
                </span>
                <span className="text-[9px] font-mono text-zinc-500">Live Status</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { name: 'Thumb', emoji: '👍', active: fingersState.thumb },
                  { name: 'Index', emoji: '☝️', active: fingersState.index },
                  { name: 'Middle', emoji: '🖕', active: fingersState.middle },
                  { name: 'Ring', emoji: '💍', active: fingersState.ring },
                  { name: 'Pinky', emoji: '🤙', active: fingersState.pinky },
                ].map(f => (
                  <div 
                    key={f.name}
                    className={cn(
                      "flex items-center justify-center gap-1 py-1.5 px-1 rounded-lg border transition-all duration-200 text-center",
                      f.active 
                        ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300 font-bold shadow-[0_0_8px_rgba(99,102,241,0.2)]" 
                        : "bg-zinc-900/60 border-zinc-800/80 text-zinc-600"
                    )}
                  >
                    <span className="text-[11px]">{f.emoji}</span>
                    <span className="text-[8px] font-mono uppercase truncate">{f.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Conductor Gesture Guide */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Conductor Gesture Map
                </span>
                <span className="text-[9px] font-mono text-zinc-500">Auto Triggered</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[9px] font-mono">
                <div className={cn(
                  "flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-colors",
                  (fingersState.index && fingersState.middle && fingersState.ring && fingersState.pinky)
                    ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                    : "bg-zinc-900/40 border-zinc-800/60 text-zinc-400"
                )}>
                  <span className="font-bold">🖐️ PALM</span>
                  <span className="text-rose-400 truncate max-w-[80px]">Mic Loop 1</span>
                </div>

                <div className={cn(
                  "flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-colors",
                  (fingersState.thumb && !fingersState.index && !fingersState.middle && !fingersState.ring && !fingersState.pinky)
                    ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                    : "bg-zinc-900/40 border-zinc-800/60 text-zinc-400"
                )}>
                  <span className="font-bold">👍 THUMB</span>
                  <span className="text-rose-400 truncate max-w-[80px]">Mic Loop 2</span>
                </div>

                <div className={cn(
                  "flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-colors",
                  (fingersState.index && !fingersState.middle && !fingersState.ring && fingersState.pinky)
                    ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                    : "bg-zinc-900/40 border-zinc-800/60 text-zinc-400"
                )}>
                  <span className="font-bold">🤘 ROCK</span>
                  <span className="text-rose-400 truncate max-w-[80px]">Mic Loop 3</span>
                </div>

                <div className={cn(
                  "flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-colors",
                  (fingersState.thumb && !fingersState.index && !fingersState.middle && !fingersState.ring && fingersState.pinky)
                    ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                    : "bg-zinc-900/40 border-zinc-800/60 text-zinc-400"
                )}>
                  <span className="font-bold">🤙 CALL ME</span>
                  <span className="text-rose-400 truncate max-w-[80px]">Mic Loop 4</span>
                </div>

                <div className={cn(
                  "flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-colors",
                  (fingersState.index && !fingersState.middle && !fingersState.ring && !fingersState.pinky)
                    ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300"
                    : "bg-zinc-900/40 border-zinc-800/60 text-zinc-400"
                )}>
                  <span className="font-bold">☝️ POINT</span>
                  <span className="text-indigo-400 truncate max-w-[80px]">PolySynth</span>
                </div>

                <div className={cn(
                  "flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-colors",
                  (fingersState.index && fingersState.middle && !fingersState.ring && !fingersState.pinky)
                    ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                    : "bg-zinc-900/40 border-zinc-800/60 text-zinc-400"
                )}>
                  <span className="font-bold">✌️ PEACE</span>
                  <span className="text-cyan-400 truncate max-w-[80px]">808 Groove</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full-Screen Expanded Live Audio Routing Studio (4 Columns, 3 Rows = 12 Tracks) */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col shadow-xl flex-1">
        {/* Studio Console Header */}
        <div className="flex justify-between items-center mb-3 pb-2.5 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-indigo-400" />
              Live Audio Routing
            </h2>
            <span className="text-[10px] font-mono bg-zinc-900 text-indigo-400 px-2.5 py-0.5 rounded-full border border-zinc-800 font-semibold">
              {tracks.length} Active Tracks (3x4 Matrix • {tracks.filter(t => t.type === 'loop').length} Mic Loops)
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsAssignModalOpen(true)}
              className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white bg-indigo-600 hover:bg-indigo-500 transition-all px-3 py-1.5 rounded-lg border border-indigo-500 shadow-md shadow-indigo-600/20 cursor-pointer active:scale-95"
              id="assign-new-track-btn"
            >
              <Plus className="w-3.5 h-3.5" /> Assign New Track
            </button>
          </div>
        </div>

        {/* 12-Track 4-Column Grid Layout (3 Rows x 4 Columns) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {tracks.map((track, idx) => (
            <div 
              key={track.id} 
              className={cn(
                "group flex flex-col justify-between p-2.5 rounded-xl border transition-all duration-200 relative",
                track.status === 'recording' ? "bg-rose-950/25 border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.15)] ring-1 ring-rose-500/30" :
                track.status === 'playing' ? "bg-indigo-950/25 border-indigo-500/50 shadow-[0_0_12px_rgba(99,102,241,0.15)] ring-1 ring-indigo-500/30" :
                track.muted ? "bg-zinc-950/60 border-zinc-900 opacity-50" :
                "bg-zinc-900/70 border-zinc-800/80 hover:border-zinc-700"
              )}
            >
              {/* Row 1: Track Identity & Gain Level / Mute */}
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {/* Status Indicator Icon */}
                  <div className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs transition-colors",
                    track.status === 'recording' ? "bg-rose-500 text-white animate-pulse" :
                    track.status === 'playing' ? "bg-indigo-600 text-white" :
                    track.type === 'loop' ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                    track.type === 'instrument' ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" :
                    "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                  )}>
                    {track.type === 'loop' ? <Mic className="w-3 h-3" /> :
                     track.type === 'instrument' ? <Music className="w-3 h-3" /> :
                     <Radio className="w-3 h-3" />}
                  </div>

                  {/* Track Title */}
                  <span className="text-[11px] font-bold uppercase tracking-tight truncate text-zinc-200" title={track.name}>
                    <span className="font-mono text-zinc-500 text-[10px] mr-1">{idx < 9 ? `0${idx + 1}` : idx + 1}</span>
                    {track.name}
                  </span>
                </div>

                {/* Volume & Mute */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggleMute(track.id)}
                    className={cn(
                      "p-1 rounded text-zinc-500 hover:text-white transition-colors cursor-pointer",
                      track.muted && "text-rose-400 hover:text-rose-300"
                    )}
                    title={track.muted ? "Unmute Track" : "Mute Track"}
                  >
                    {track.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  </button>

                  <input
                    type="range"
                    min="-30"
                    max="6"
                    step="1"
                    value={track.volume ?? -6}
                    onChange={(e) => handleVolumeChange(track.id, Number(e.target.value))}
                    disabled={track.muted}
                    className="w-10 h-1 bg-zinc-800 rounded appearance-none accent-indigo-500 cursor-pointer disabled:opacity-30"
                  />
                  <span className="font-mono text-[8px] text-zinc-500 w-6 text-right">
                    {track.muted ? 'MUT' : `${track.volume ?? -6}dB`}
                  </span>

                  {tracks.length > 1 && (
                    <button
                      onClick={() => handleDeleteTrack(track.id)}
                      className="p-1 text-zinc-600 hover:text-rose-400 rounded hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Remove Track"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Sub-row: Badges (Loop duration & Assigned Gesture) */}
              <div className="flex items-center gap-1.5 my-1.5">
                <span className="shrink-0 text-[8px] font-mono uppercase bg-zinc-800/90 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700/50">
                  {track.type === 'loop' ? `${track.loopDuration || 10}s Loop` : track.type}
                </span>

                {track.assignedGesture && track.assignedGesture !== 'Manual Only' && (
                  <span className="shrink-0 text-[8px] font-mono uppercase bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded truncate max-w-[110px]">
                    {track.assignedGesture}
                  </span>
                )}
              </div>

              {/* Row 2: Status Progress Bar & Quick Action Triggers */}
              <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-zinc-800/50">
                {/* Visualizer / Progress */}
                <div className="flex-1 flex items-center gap-1.5 min-w-0">
                  <span className={cn(
                    "text-[9px] font-mono uppercase tracking-tight shrink-0 font-bold truncate max-w-[55px]",
                    track.status === 'recording' ? "text-rose-400" :
                    track.status === 'playing' ? "text-indigo-400" :
                    "text-zinc-500"
                  )}>
                    {track.status === 'recording' 
                      ? `${recordingTimeLeft.toFixed(1)}s` 
                      : track.status === 'playing' 
                      ? (track.type === 'loop' 
                          ? `${(loopProgress[track.id]?.secondsLeft ?? (track.loopDuration || 10)).toFixed(1)}s` 
                          : `Play`) 
                      : track.muted 
                      ? 'Mut' 
                      : 'Rdy'}
                  </span>

                  <div className="h-1.5 flex-1 bg-zinc-800/80 rounded-full overflow-hidden relative">
                    {track.status === 'recording' ? (
                      <div 
                        className="h-full bg-rose-500 transition-all duration-100 shadow-[0_0_6px_rgba(244,63,94,0.6)]" 
                        style={{ width: `${(((track.loopDuration || 10) - recordingTimeLeft) / (track.loopDuration || 10)) * 100}%` }}
                      />
                    ) : track.status === 'playing' ? (
                      track.type === 'loop' ? (
                        <div 
                          className="h-full bg-indigo-500 transition-all duration-75 relative rounded-full shadow-[0_0_8px_rgba(99,102,241,0.6)]" 
                          style={{ width: `${loopProgress[track.id]?.percent ?? 0}%` }}
                        >
                          <div className="absolute right-0 top-0 bottom-0 w-1 bg-white rounded-full shadow-[0_0_4px_#ffffff]" />
                        </div>
                      ) : (
                        <div className="h-full w-full bg-gradient-to-r from-indigo-500 to-cyan-400 animate-pulse" />
                      )
                    ) : (
                      <div className="h-full w-full bg-zinc-800/30" />
                    )}
                  </div>
                </div>

                {/* Compact Action Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  {track.type === 'loop' ? (
                    <>
                      <button
                        onClick={() => {
                          if (track.status === 'recording' || activeRecordingTrackId === track.id) {
                            finishRecording(track.id);
                          } else {
                            simulateGesture('Manual Rec', 'record_loop', track.id);
                          }
                        }}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] font-bold font-mono uppercase flex items-center gap-0.5 transition-all cursor-pointer",
                          (track.status === 'recording' || activeRecordingTrackId === track.id)
                            ? "bg-rose-600 text-white animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)] ring-1 ring-rose-400"
                            : "bg-zinc-800 text-rose-400 hover:bg-rose-600/20 border border-rose-500/20"
                        )}
                        title={(track.status === 'recording' || activeRecordingTrackId === track.id) ? "Finish recording & start loop" : "Record Mic Loop"}
                      >
                        <Mic className="w-2.5 h-2.5" />
                        <span>{(track.status === 'recording' || activeRecordingTrackId === track.id) ? 'End' : 'Rec'}</span>
                      </button>

                      <button
                        onClick={() => {
                          if (track.status === 'recording' || activeRecordingTrackId === track.id) {
                            finishRecording(track.id);
                          } else if (track.status === 'playing') {
                            simulateGesture('Manual Stop', 'stop_single', track.id);
                          } else {
                            simulateGesture('Manual Play', 'play_loop', track.id);
                          }
                        }}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] font-bold font-mono uppercase flex items-center gap-0.5 transition-colors cursor-pointer",
                          track.status === 'playing'
                            ? "bg-indigo-600 text-white shadow-[0_0_8px_rgba(99,102,241,0.4)]"
                            : "bg-zinc-800 text-indigo-400 hover:bg-indigo-600/20 border border-indigo-500/20"
                        )}
                        title={track.status === 'playing' ? "Stop Loop" : "Play Loop"}
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>{track.status === 'playing' ? 'Loop' : 'Play'}</span>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        simulateGesture('Manual Play', 'play', track.id);
                      }}
                      className={cn(
                        "px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase flex items-center gap-0.5 transition-colors cursor-pointer",
                        track.status === 'playing'
                          ? "bg-indigo-600 text-white"
                          : "bg-zinc-800 text-indigo-400 hover:bg-indigo-600/20 border border-indigo-500/20"
                      )}
                      title="Trigger Track"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>Trigger</span>
                    </button>
                  )}

                  {/* Stop Track Button */}
                  <button 
                    className={cn(
                      "w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer",
                      track.status !== 'idle'
                        ? "bg-zinc-800 text-rose-400 hover:bg-rose-900/50 hover:text-white"
                        : "bg-zinc-900 text-zinc-600 hover:text-zinc-400"
                    )}
                    onClick={() => {
                      simulateGesture('Manual Stop', 'stop_single', track.id);
                    }}
                    title="Stop track"
                  >
                    <Square className="w-2.5 h-2.5 fill-current" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
