import React, { useState, useRef, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
const WebcamComponent = Webcam as any;
import * as Tone from 'tone';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { TrackData } from '../types';
import { Play, Square, Mic, Radio, Hand, Plus, Activity, Camera, VideoOff, Cpu, CheckCircle2 } from 'lucide-react';
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
  const lastTriggerTimeRef = useRef<number>(0);
  
  const [isAudioReady, setIsAudioReady] = useState(false);
  const isAudioReadyRef = useRef(false);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const isCameraOnRef = useRef(true);
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [recordingTimeLeft, setRecordingTimeLeft] = useState<number>(10);

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

  useEffect(() => {
    isCameraOnRef.current = isCameraOn;
  }, [isCameraOn]);

  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' as PermissionName })
        .then((permissionStatus) => {
          setMicPermission(permissionStatus.state as 'granted' | 'denied' | 'prompt');
          permissionStatus.onchange = () => {
            setMicPermission(permissionStatus.state as 'granted' | 'denied' | 'prompt');
          };
        })
        .catch((err) => console.log("Permissions API error:", err));
    }
  }, []);
  
  const [tracks, setTracks] = useState<TrackData[]>([
    { id: '1', name: 'Mic Loop 1', type: 'loop', status: 'idle', volume: -6 },
    { id: '2', name: 'Pattern Synth', type: 'instrument', status: 'idle', volume: -12 },
    { id: '3', name: 'Drum Sample', type: 'sample', status: 'idle', volume: 0 },
  ]);

  const [activeGesture, setActiveGesture] = useState<string | null>(null);
  const [sessionStartTime] = useState(Date.now());
  const [stats, setStats] = useState({ gestures: 0, loops: 0 });

  // Tone.js refs
  const synths = useRef<Record<string, Tone.PolySynth | Tone.Synth>>({});
  const loops = useRef<Record<string, Tone.Player>>({});

  useEffect(() => {
    isAudioReadyRef.current = isAudioReady;
  }, [isAudioReady]);

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

  // Initialize Synths
  useEffect(() => {
    synths.current['2'] = new Tone.PolySynth(Tone.Synth).toDestination();
    synths.current['2'].volume.value = -12;
    
    return () => {
      // Cleanup
      Object.values(synths.current).forEach(s => (s as any).dispose());
      Object.values(loops.current).forEach(l => (l as any).dispose());
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
      await Tone.start();
      console.log("Tone.js audio context started");
      
      // Request microphone permission to capture real mic loop audio
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Microphone access granted successfully");
      micStreamRef.current = stream;
      setMicPermission('granted');
      setIsAudioReady(true);
    } catch (err) {
      console.error("Error accessing microphone or starting audio engine:", err);
      setMicPermission('denied');
      setIsAudioReady(true); // Proceed with engine start anyway so they can play synths
    }
  };

  const simulateGesture = useCallback((gestureName: string, action: string, targetId: string) => {
    if (!isAudioReadyRef.current) return;
    setActiveGesture(gestureName);
    setStats(s => ({ ...s, gestures: s.gestures + 1 }));
    
    // Execute action
    if (action === 'play_instrument') {
      const synth = synths.current[targetId];
      if (synth) {
        setTracks(ts => ts.map(t => t.id === targetId ? { ...t, status: 'playing' } : t));
        synth.triggerAttackRelease(["C4", "E4", "G4"], "4n");
        setTimeout(() => {
          setTracks(ts => ts.map(t => t.id === targetId ? { ...t, status: 'idle' } : t));
        }, 500);
      }
    } else if (action === 'record_loop') {
      // Check if already recording
      setTracks(ts => {
        const isAlreadyRec = ts.some(t => t.id === targetId && t.status === 'recording');
        if (isAlreadyRec) return ts;

        // Trigger loop record
        setStats(s => ({ ...s, loops: s.loops + 1 }));
        setRecordingTimeLeft(10.0);

        // Standard countdown timer
        const timerInterval = setInterval(() => {
          setRecordingTimeLeft(prev => {
            if (prev <= 0.1) {
              clearInterval(timerInterval);
              return 0;
            }
            return prev - 0.1;
          });
        }, 100);

        // Try actual recording if we have mic stream
        let recorder: MediaRecorder | null = null;
        if (micStreamRef.current) {
          try {
            audioChunksRef.current = [];
            recorder = new MediaRecorder(micStreamRef.current);
            mediaRecorderRef.current = recorder;
            recorder.ondataavailable = (e) => {
              if (e.data.size > 0) {
                audioChunksRef.current.push(e.data);
              }
            };
            recorder.onstop = () => {
              const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
              const audioUrl = URL.createObjectURL(blob);
              
              if (loops.current['1']) {
                loops.current['1'].dispose();
              }
              const player = new Tone.Player({
                url: audioUrl,
                loop: true,
                autostart: true,
              }).toDestination();
              player.volume.value = -6;
              loops.current['1'] = player;
            };
            recorder.start();
          } catch (err) {
            console.error("Failed to start MediaRecorder:", err);
          }
        }

        // Handle 10-second completion
        setTimeout(() => {
          if (recorder && recorder.state === 'recording') {
            recorder.stop();
            setTracks(currentTracks => currentTracks.map(t => t.id === targetId ? { ...t, status: 'playing' } : t));
          } else {
            // No microphone stream available or active, revert back to idle safely
            setTracks(currentTracks => currentTracks.map(t => t.id === targetId ? { ...t, status: 'idle' } : t));
          }
        }, 10000);

        return ts.map(t => t.id === targetId ? { ...t, status: 'recording' } : t);
      });
    } else if (action === 'stop_all') {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (loops.current['1']) {
        loops.current['1'].stop();
      }
      if (synths.current['1_sim']) {
        try {
          synths.current['1_sim'].dispose();
        } catch (e) {}
        delete synths.current['1_sim'];
      }
      setTracks(ts => ts.map(t => ({ ...t, status: 'idle' })));
    }

    setTimeout(() => setActiveGesture(null), 1000);
  }, []);

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
        
        const startTimeMs = performance.now();
        if (lastVideoTimeRef.current !== video.currentTime) {
          lastVideoTimeRef.current = video.currentTime;
          const results = landmarker.detectForVideo(video, startTimeMs);
          
          if (results.landmarks && results.landmarks.length > 0) {
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
              
              // Draw connections (simple wireframe)
              ctx.strokeStyle = '#6366f1'; // indigo-500
              ctx.lineWidth = 2;
              const connections = [
                [0, 1, 2, 3, 4], // thumb
                [0, 5, 6, 7, 8], // index
                [9, 10, 11, 12], // middle
                [13, 14, 15, 16], // ring
                [17, 18, 19, 20], // pinky
                [5, 9, 13, 17, 0] // palm
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
            
            // A finger is extended if tip is far from both MCP joint and Wrist
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

            // Thumb is extended if it is reasonably straight and stands outward away from the palm/index finger
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

            // Robust check: straight thumb, and tip is further away from the palm base & index finger than the thumb's base joint is
            const thumbUp = isThumbStraight && (thumbOutwardRatio > 1.15) && (thumbAwayFromPinkyRatio > 1.02);

            // Stable fingersState React updates
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

            // Determine current raw gesture candidate
            let gesture = null;
            if (indexUp && middleUp && ringUp && pinkyUp) {
              gesture = 'Open Palm';
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

              // Fire ONLY if the gesture is consistently held for at least 5 consecutive frames (~150-200ms)
              if (gestureConsecutiveFramesRef.current >= 5) {
                const now = Date.now();
                if (now - lastTriggerTimeRef.current > 1000) {
                  lastTriggerTimeRef.current = now;
                  if (gesture === 'Open Palm') {
                    simulateGesture(gesture, 'record_loop', '1');
                  } else if (gesture === 'Point Up') {
                    simulateGesture(gesture, 'play_instrument', '2');
                  } else if (gesture === 'Fist') {
                    simulateGesture(gesture, 'stop_all', '');
                  }
                }
              }
            } else {
              gestureCandidateRef.current = null;
              gestureConsecutiveFramesRef.current = 0;
            }
          } else {
            // No hands in frame, reset finger state
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

  // Stable animation frame loop hook
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
    <div className="flex flex-col h-full space-y-4">
      {/* Dynamic Status Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-zinc-950 border border-zinc-800 rounded-xl p-4">
        {/* Camera Controller & Status */}
        <div className="flex items-center justify-between border-b md:border-b-0 md:border-r border-zinc-800 pb-4 md:pb-0 md:pr-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              isCameraOn ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
            )}>
              {isCameraOn ? <Camera className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Conduction Camera</div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase">
                {isCameraOn ? "Camera: Active" : "Camera: Off / Disabled"}
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsCameraOn(!isCameraOn)}
            className={cn(
              "px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
              isCameraOn 
                ? "bg-zinc-900 hover:bg-rose-950/30 text-rose-400 border-rose-500/20 hover:border-rose-500/40" 
                : "bg-indigo-600 hover:bg-indigo-700 text-white border-transparent"
            )}
            id="toggle-camera-btn"
          >
            {isCameraOn ? "Turn Off" : "Turn On"}
          </button>
        </div>

        {/* MediaPipe Model Status */}
        <div className="flex items-center gap-3 border-b md:border-b-0 md:border-r border-zinc-800 pb-4 md:pb-0 md:px-4">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
            modelError ? "bg-rose-500/10 text-rose-400" : isModelLoading ? "bg-amber-500/10 text-amber-400 animate-pulse" : "bg-emerald-500/10 text-emerald-400"
          )}>
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Hand Detection Engine</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={cn(
                "w-2 h-2 rounded-full shrink-0",
                modelError ? "bg-rose-500 shadow-[0_0_8px_#ef4444]" : isModelLoading ? "bg-amber-400 animate-ping" : "bg-emerald-400 shadow-[0_0_8px_#34d399]"
              )}></span>
              <span className={cn(
                "text-xs font-bold font-mono tracking-widest uppercase",
                modelError ? "text-rose-400" : isModelLoading ? "text-amber-400" : "text-emerald-400"
              )}>
                {modelError ? "TRACKING: SIMULATED" : isModelLoading ? "LOADING MODEL..." : "TRACKING: ACTIVE"}
              </span>
            </div>
          </div>
        </div>

        {/* Microphone Audio Status */}
        <div className="flex items-center justify-between pl-0 md:pl-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              !isAudioReady ? "bg-rose-500/10 text-rose-400" :
              micPermission === 'granted' ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
            )}>
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Audio & Mic Routing</div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase">
                {!isAudioReady ? "AUDIO ENGINE: READY" :
                 micPermission === 'granted' ? "MIC: CAPTURING LIVE" :
                 micPermission === 'denied' ? "MIC: ACCESS DENIED" : "MIC: ACCESS REQUESTED"}
              </div>
            </div>
          </div>
          {!isAudioReady && (
            <button
              onClick={initAudio}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
              id="start-audio-btn"
            >
              Start Engine
            </button>
          )}
        </div>
      </div>

      {/* Header & Video Area */}
      <div className="flex flex-col lg:flex-row gap-4 h-[50vh]">
        
        {/* Main Tracking Video */}
        <div className="flex-1 bg-zinc-900 rounded-2xl overflow-hidden relative border border-zinc-800 shadow-2xl shadow-indigo-900/10 flex items-center justify-center">
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10 pointer-events-none"></div>
          
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
              <VideoOff className="w-12 h-12 text-zinc-700 mb-2 animate-pulse" />
              <p className="text-xs uppercase tracking-wider font-mono">Camera Feed Offline</p>
              <button 
                onClick={() => setIsCameraOn(true)}
                className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded text-xs uppercase tracking-wider transition-all"
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
            <div className="flex gap-2">
              <span className="px-2 py-1 bg-black/60 rounded text-[10px] font-mono border border-zinc-700 text-white">CAM_01: WIDE_ANGLE</span>
              <span className="px-2 py-1 bg-indigo-600/80 rounded text-[10px] font-mono border border-white/20 text-white">
                {isModelLoading ? 'LOADING MODEL...' : 'TRACKING: ACTIVE'}
              </span>
            </div>

            {/* Simulated Tracking Bounding Box */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[400px] h-[300px] border-2 border-indigo-500/20 rounded-full flex items-center justify-center">
              <div className="absolute w-64 h-64 border border-indigo-400/30 rounded-lg"></div>
              <div className="absolute top-1/4 left-1/4 w-3 h-3 bg-cyan-400 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.8)]"></div>
              <div className="absolute top-1/3 right-1/4 w-3 h-3 bg-cyan-400 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.8)]"></div>
            </div>

            {/* Active Gesture Feedback */}
            <div className="flex justify-center text-center pb-4">
              {activeGesture ? (
                <div className="animate-in fade-in slide-in-from-bottom-2">
                  <div className="text-xs uppercase tracking-[0.3em] text-zinc-400 mb-2">Detected Command</div>
                  <div className="text-4xl md:text-5xl font-black italic tracking-tighter text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.4)]">{activeGesture}</div>
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-white/20">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                    <span className="text-[10px] font-bold tracking-widest text-white">GESTURE: {activeGesture.toUpperCase().replace(/\s+/g, '_')}</span>
                  </div>
                </div>
              ) : (
                <div className="h-24" /> // Placeholder
              )}
            </div>
          </div>
        </div>

        {/* Action Panel / Dashboard (Right Side) */}
        <div className="w-full lg:w-80 flex flex-col gap-4">
          {!isAudioReady && (
            <button 
              onClick={initAudio}
              className="w-full py-3 bg-rose-600/20 text-rose-400 border border-rose-600/30 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors hover:bg-rose-600/30"
            >
              Start Audio Engine
            </button>
          )}

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex-1 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-4 flex items-center gap-2">
                 Session Metrics
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-lg p-2.5 flex flex-col items-center justify-center">
                  <span className="text-[9px] text-indigo-400 uppercase tracking-wider font-mono">Gestures</span>
                  <span className="text-lg font-mono font-bold text-white mt-0.5">{stats.gestures}</span>
                </div>
                <div className="bg-rose-500/5 border border-rose-500/10 rounded-lg p-2.5 flex flex-col items-center justify-center">
                  <span className="text-[9px] text-rose-400 uppercase tracking-wider font-mono">Loops Recorded</span>
                  <span className="text-lg font-mono font-bold text-white mt-0.5">{stats.loops}</span>
                </div>
              </div>

              {/* Live Finger Status Tracker */}
              <div className="mt-5 pt-4 border-t border-zinc-800/80">
                <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Activity className="w-3 h-3 text-indigo-400 animate-pulse" />
                  Live Finger Status
                </h4>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { name: 'Thumb', label: 'Thumb', emoji: '👍', active: fingersState.thumb },
                    { name: 'Index', label: 'Index', emoji: '☝️', active: fingersState.index },
                    { name: 'Middle', label: 'Middle', emoji: '🖕', active: fingersState.middle },
                    { name: 'Ring', label: 'Ring', emoji: '💍', active: fingersState.ring },
                    { name: 'Pinky', label: 'Pinky', emoji: '🤙', active: fingersState.pinky },
                  ].map(f => (
                    <div 
                      key={f.name}
                      className={cn(
                        "flex flex-col items-center justify-center p-1.5 rounded-lg border transition-all duration-300",
                        f.active 
                          ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.15)] font-bold" 
                          : "bg-zinc-950/80 border-zinc-800 text-zinc-600"
                      )}
                    >
                      <span className={cn("text-xs mb-1 transition-transform duration-300", f.active && "scale-110 drop-shadow-[0_0_4px_rgba(255,255,255,0.2)]")}>
                        {f.emoji}
                      </span>
                      <span className="text-[8px] font-mono uppercase tracking-tight truncate max-w-full">
                        {f.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Conductor Gesture Dictionary */}
              <div className="mt-5 pt-4 border-t border-zinc-800/80">
                <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2.5">
                  Conductor Gesture Guide
                </h4>
                <div className="space-y-2 text-[10px] font-mono text-zinc-400">
                  <div className={cn(
                    "flex items-center justify-between p-1.5 px-2 rounded-lg border transition-all duration-200",
                    (fingersState.index && fingersState.middle && fingersState.ring && fingersState.pinky)
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                      : "bg-zinc-950/40 border-zinc-900"
                  )}>
                    <span className="font-bold flex items-center gap-1.5">🖐️ OPEN PALM</span>
                    <span className="font-semibold text-rose-400">Record Loop (10s)</span>
                  </div>
                  <div className={cn(
                    "flex items-center justify-between p-1.5 px-2 rounded-lg border transition-all duration-200",
                    (fingersState.index && !fingersState.middle && !fingersState.ring && !fingersState.pinky)
                      ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                      : "bg-zinc-950/40 border-zinc-900"
                  )}>
                    <span className="font-bold flex items-center gap-1.5">☝️ POINT UP</span>
                    <span className="font-semibold text-indigo-400">Pattern Synth</span>
                  </div>
                  <div className={cn(
                    "flex items-center justify-between p-1.5 px-2 rounded-lg border transition-all duration-200",
                    (!fingersState.index && !fingersState.middle && !fingersState.ring && !fingersState.pinky && lastFingersStateRef.current.index === false)
                      ? "bg-zinc-800 border-zinc-700 text-white"
                      : "bg-zinc-950/40 border-zinc-900"
                  )}>
                    <span className="font-bold flex items-center gap-1.5">✊ FIST</span>
                    <span className="font-semibold text-zinc-500">Stop All Tracks</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Manual Controls / Simulator Shortcuts */}
            <div className="pt-4 border-t border-zinc-800">
              <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Simulate Input</h4>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => simulateGesture('Open Palm', 'record_loop', '1')}
                  className="bg-zinc-950 hover:bg-rose-900/20 text-[9px] text-zinc-400 hover:text-rose-400 py-1.5 rounded-lg font-mono uppercase transition-colors border border-zinc-800 cursor-pointer"
                >
                  Sim_Palm
                </button>
                <button 
                  onClick={() => simulateGesture('Point Up', 'play_instrument', '2')}
                  className="bg-zinc-950 hover:bg-indigo-900/20 text-[9px] text-zinc-400 hover:text-indigo-400 py-1.5 rounded-lg font-mono uppercase transition-colors border border-zinc-800 cursor-pointer"
                >
                  Sim_Point
                </button>
                <button 
                  onClick={() => simulateGesture('Fist', 'stop_all', '')}
                  className="bg-zinc-950 hover:bg-zinc-800 text-[9px] text-zinc-400 py-1.5 rounded-lg font-mono uppercase transition-colors border border-zinc-800 col-span-2 cursor-pointer"
                >
                  Sim_Fist_Stop
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tracks Area (Bottom) */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex-1 overflow-hidden flex flex-col shadow-inner">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Live Audio Routing</h2>
          <button className="flex items-center gap-1 text-[10px] font-bold uppercase text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-500/20">
            <Plus className="w-3 h-3" /> Assign New Track
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {tracks.map((track) => (
            <div 
              key={track.id} 
              className={cn(
                "group flex items-center gap-3 p-1 px-3 rounded-lg border transition-all duration-300",
                track.status === 'recording' ? "bg-rose-600/10 border-rose-500/30" :
                track.status === 'playing' ? "bg-indigo-600/10 border-indigo-500/30" :
                "bg-zinc-900 border-zinc-800 opacity-75 hover:opacity-100"
              )}
            >
              {/* Status Icon */}
              <div className={cn(
                "w-8 h-8 rounded flex items-center justify-center shrink-0 transition-colors",
                track.status === 'recording' ? "bg-rose-500 text-white" :
                track.status === 'playing' ? "bg-zinc-800 text-indigo-400" :
                "bg-zinc-800 text-zinc-500"
              )}>
                {track.type === 'loop' ? <Mic className="w-3.5 h-3.5" /> :
                 track.type === 'instrument' ? <Radio className="w-3.5 h-3.5" /> :
                 <Play className="w-3.5 h-3.5" />}
              </div>

              {/* Track Info */}
              <div className="flex-1 min-w-0">
                <div className={cn("text-xs font-bold uppercase tracking-wide truncate", track.status === 'idle' ? "text-white" : track.status === 'recording' ? "text-white" : "text-indigo-200")}>
                  Track 0{track.id}: {track.name}
                </div>
                <div className={cn("text-[9px] font-mono uppercase mt-0.5", track.status === 'idle' ? "text-zinc-500" : track.status === 'recording' ? "text-rose-400 font-bold" : "text-indigo-400")}>
                  {track.status === 'recording' ? `Recording... ${recordingTimeLeft.toFixed(1)}s` : track.status === 'playing' ? `Playing: ${track.type}` : 'Muted'}
                </div>
                
                {/* Visualizer / Progress Bar */}
                <div className="h-1.5 w-full mt-1.5 flex items-center bg-zinc-800/40 rounded-full overflow-hidden relative">
                  {track.status === 'recording' ? (
                    <div 
                      className="h-full bg-rose-500 transition-all duration-100" 
                      style={{ width: `${((10 - recordingTimeLeft) / 10) * 100}%` }}
                    />
                  ) : track.status === 'playing' ? (
                    <div className="flex items-center gap-0.5 w-full h-full">
                      {Array.from({ length: 40 }).map((_, i) => (
                        <div 
                          key={i} 
                          className={cn(
                            "h-full w-1 rounded-full transition-all duration-100",
                            "bg-indigo-500"
                          )}
                          style={{
                            opacity: Math.random() * 0.5 + 0.3,
                            animationDelay: `${i * 0.05}s`
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="h-full w-full bg-zinc-900/50" />
                  )}
                </div>
              </div>

              {/* Track Controls */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right font-mono text-[10px] text-zinc-400">
                  {track.volume === 0 ? '-inf' : `${track.volume}db`}
                </div>
                <button 
                  className={cn(
                    "w-6 h-6 rounded flex items-center justify-center transition-colors cursor-pointer",
                    track.status === 'recording' ? "bg-rose-900/50 text-rose-400 hover:bg-rose-500 hover:text-white" :
                    track.status === 'playing' ? "bg-indigo-900/50 text-indigo-400 hover:bg-indigo-500 hover:text-white" :
                    "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                  )}
                  onClick={() => {
                    if (track.status !== 'idle') {
                      simulateGesture('Manual Stop', 'stop_all', track.id);
                    }
                  }}
                >
                  <Square className="w-2 h-2 fill-current" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
