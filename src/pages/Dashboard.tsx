import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { SessionData } from '../types';
import { Activity, Clock, Target, PlayCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function Dashboard() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSessions() {
      if (!user) return;
      const q = query(
        collection(db, 'sessions'),
        where('userId', '==', user.uid),
        orderBy('startTime', 'desc')
      );
      try {
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SessionData));
        setSessions(data);
      } catch (err) {
        console.error("Failed to load sessions:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchSessions();
  }, [user]);

  // Mock data for the chart if empty
  const chartData = sessions.length > 0 ? sessions.map(s => ({
    date: new Date(s.startTime).toLocaleDateString(),
    gestures: s.gesturesRecognized,
    loops: s.loopsRecorded,
  })) : [
    { date: 'Mon', gestures: 12, loops: 4 },
    { date: 'Tue', gestures: 45, loops: 10 },
    { date: 'Wed', gestures: 30, loops: 8 },
    { date: 'Thu', gestures: 78, loops: 15 },
    { date: 'Fri', gestures: 110, loops: 22 },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="h-14 border-b border-zinc-800/50 flex items-center justify-between mb-2">
        <h1 className="text-sm font-semibold tracking-widest uppercase">Conductor Dashboard</h1>
        <div className="flex items-center gap-8">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase text-zinc-500 tracking-tighter">Global BPM</span>
            <span className="text-lg font-mono font-bold text-indigo-400 leading-none">124.00</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Sessions', value: sessions.length || 5, icon: Activity, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
          { label: 'Gestures Recognized', value: sessions.reduce((acc, s) => acc + s.gesturesRecognized, 0) || 275, icon: Target, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
          { label: 'Loops Recorded', value: sessions.reduce((acc, s) => acc + s.loopsRecorded, 0) || 59, icon: PlayCircle, color: 'text-rose-400', bg: 'bg-rose-500/10' },
          { label: 'Practice Time', value: '14h 30m', icon: Clock, color: 'text-zinc-400', bg: 'bg-zinc-800' },
        ].map((stat, i) => (
          <div key={i} className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">{stat.label}</span>
              <div className={`w-8 h-8 rounded flex items-center justify-center ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </div>
            <div className="text-2xl font-mono font-bold text-white">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 shadow-lg">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Activity Overview</h2>
            <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20">LIVE DATA</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="date" stroke="#71717a" tick={{fill: '#71717a', fontSize: 10, fontFamily: 'monospace'}} axisLine={false} tickLine={false} />
                <YAxis stroke="#71717a" tick={{fill: '#71717a', fontSize: 10, fontFamily: 'monospace'}} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace' }}
                  itemStyle={{ color: '#e4e4e7' }}
                />
                <Line type="monotone" dataKey="gestures" stroke="#4f46e5" strokeWidth={2} dot={false} name="Gestures" />
                <Line type="monotone" dataKey="loops" stroke="#06b6d4" strokeWidth={2} dot={false} name="Loops" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 shadow-lg">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400">Developmental Path</h2>
            <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20">Level 14</span>
          </div>
          <div className="space-y-4">
            {[
              { title: 'Basic Loop Triggering', status: 'completed', desc: 'Mastered start/stop cues.' },
              { title: 'Volume Swells', status: 'current', desc: 'Control track intensity via hand height.' },
              { title: 'Multi-track Splitting', status: 'locked', desc: 'Assign different zones to left/right hands.' },
              { title: 'Programmatic Instruments', status: 'locked', desc: 'Trigger MIDI scales via finger count.' }
            ].map((step, i) => (
              <div key={i} className="flex gap-3 relative">
                <div className="flex flex-col items-center z-10">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                    step.status === 'completed' ? 'bg-indigo-500 text-white border-zinc-900 shadow-[0_0_15px_rgba(99,102,241,0.5)]' :
                    step.status === 'current' ? 'bg-zinc-800 text-white border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.3)]' : 'bg-zinc-900 text-zinc-700 border-zinc-800'
                  }`}>
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  {i < 3 && <div className="w-px flex-1 bg-zinc-800 my-1" />}
                </div>
                <div className="pb-4">
                  <h3 className={`text-xs font-bold uppercase tracking-wide ${step.status === 'locked' ? 'text-zinc-600' : 'text-zinc-200'}`}>
                    {step.title}
                  </h3>
                  <p className="text-[10px] text-zinc-500 mt-1">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
