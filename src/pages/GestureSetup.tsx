import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { GestureMapping } from '../types';
import { Hand, Plus, Trash2, Save } from 'lucide-react';

export function GestureSetup() {
  const { user } = useAuth();
  const [gestures, setGestures] = useState<GestureMapping[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newGesture, setNewGesture] = useState({
    name: '',
    actionType: 'record_loop',
    actionData: '',
  });

  useEffect(() => {
    async function fetchGestures() {
      if (!user) return;
      const q = query(collection(db, 'gestures'), where('userId', '==', user.uid));
      const snap = await getDocs(q);
      setGestures(snap.docs.map(d => ({ id: d.id, ...d.data() } as GestureMapping)));
      setLoading(false);
    }
    fetchGestures();
  }, [user]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newGesture.name) return;
    
    const docRef = await addDoc(collection(db, 'gestures'), {
      userId: user.uid,
      name: newGesture.name,
      actionType: newGesture.actionType,
      actionData: newGesture.actionData,
      confidenceThreshold: 0.75
    });
    
    setGestures([...gestures, { id: docRef.id, userId: user.uid, ...newGesture, confidenceThreshold: 0.75 } as GestureMapping]);
    setNewGesture({ name: '', actionType: 'record_loop', actionData: '' });
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, 'gestures', id));
    setGestures(gestures.filter(g => g.id !== id));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="h-14 border-b border-zinc-800/50 flex items-center justify-between mb-2">
        <h1 className="text-sm font-semibold tracking-widest uppercase">Gesture Setup</h1>
        <div className="flex items-center gap-8">
          <button className="px-4 py-1.5 bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 rounded-full text-[10px] font-bold uppercase tracking-wider">
            Sync Model
          </button>
        </div>
      </header>

      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-6 shadow-lg">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4">Assign New Gesture Mapping</h2>
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-zinc-500">Gesture Name</label>
            <input 
              type="text" 
              placeholder="e.g. OPEN_PALM"
              value={newGesture.name}
              onChange={e => setNewGesture({...newGesture, name: e.target.value})}
              className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-indigo-500 transition-colors uppercase"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-zinc-500">Action Type</label>
            <select 
              value={newGesture.actionType}
              onChange={e => setNewGesture({...newGesture, actionType: e.target.value})}
              className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-indigo-500 transition-colors appearance-none uppercase"
            >
              <option value="record_loop">Record Loop</option>
              <option value="play_sample">Play Pattern</option>
              <option value="play_instrument">Trigger Inst</option>
              <option value="stop_all">Stop Tracks</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-zinc-500">Parameters</label>
            <input 
              type="text" 
              placeholder="e.g. TRK_01"
              value={newGesture.actionData}
              onChange={e => setNewGesture({...newGesture, actionData: e.target.value})}
              className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-indigo-500 transition-colors uppercase"
            />
          </div>
          <button 
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded flex items-center justify-center gap-2 h-[38px] transition-colors text-[10px] uppercase tracking-wider"
          >
            <Plus className="w-4 h-4" /> Assign
          </button>
        </form>
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Active Signatures</h2>
        {loading ? (
          <div className="text-zinc-500 animate-pulse">Loading gestures...</div>
        ) : gestures.length === 0 ? (
          <div className="text-zinc-600 font-mono text-xs text-center py-8 border border-dashed border-zinc-800 rounded-xl uppercase">
            No signatures active.
          </div>
        ) : (
          gestures.map((gesture) => (
            <div key={gesture.id} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 flex items-center justify-between group hover:border-indigo-500/30 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded bg-black border border-zinc-800 flex items-center justify-center">
                  <Hand className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase">GESTURE_ID: {gesture.id.slice(0, 8)}</span>
                  <div className="flex items-baseline gap-2">
                    <h3 className="font-bold text-white uppercase">{gesture.name}</h3>
                    <span className="text-[10px] text-zinc-400 uppercase border border-zinc-700 rounded px-1.5 py-0.5">
                      {gesture.actionType.replace('_', ' ')} {gesture.actionData && `[${gesture.actionData}]`}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[10px] text-indigo-400 uppercase">CONFIDENCE</div>
                  <div className="text-sm font-mono text-white">{(gesture.confidenceThreshold * 100).toFixed(1)}%</div>
                </div>
                <button 
                  onClick={() => handleDelete(gesture.id)}
                  className="text-zinc-600 hover:text-rose-500 transition-colors p-2"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
