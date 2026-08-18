export interface GestureMapping {
  id: string;
  userId: string;
  name: string;
  actionType: 'play_instrument' | 'record_loop' | 'play_sample' | 'stop_all';
  actionData: string; // e.g. instrument name, sample id
  confidenceThreshold: number;
}

export interface SessionData {
  id: string;
  userId: string;
  startTime: number;
  endTime?: number;
  gesturesRecognized: number;
  loopsRecorded: number;
}

export interface TrackData {
  id: string;
  name: string;
  type: 'loop' | 'instrument' | 'sample';
  status: 'idle' | 'playing' | 'recording';
  volume: number;
}
