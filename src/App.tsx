/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ConductionRoom } from './pages/ConductionRoom';
import { Dashboard } from './pages/Dashboard';
import { GestureSetup } from './pages/GestureSetup';
import { Activity, LayoutDashboard, Settings, Music, Hand, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from './lib/utils';

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

function Sidebar({ isCollapsed, setIsCollapsed }: SidebarProps) {
  const location = useLocation();
  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Conduction Room', path: '/room', icon: Music },
    { name: 'Gesture Setup', path: '/setup', icon: Hand },
  ];

  return (
    <div className={cn(
      "bg-zinc-950/50 backdrop-blur-md border-r border-zinc-800 flex flex-col h-screen text-zinc-100 transition-all duration-300 relative",
      isCollapsed ? "w-16" : "w-64"
    )}>
      {/* Collapse Toggle Button */}
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-20 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 rounded-full w-6 h-6 flex items-center justify-center cursor-pointer z-50 transition-colors"
        id="toggle-sidebar-btn"
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      <div className={cn("p-6 border-b border-zinc-800/50 mb-4 flex items-center", isCollapsed ? "justify-center px-2" : "justify-between")}>
        <h1 className="text-sm font-semibold tracking-widest uppercase flex items-center gap-2">
          <div className="w-6 h-6 bg-indigo-600 rounded-sm flex items-center justify-center font-bold text-xs text-white shrink-0">Σ</div>
          {!isCollapsed && <span>Conductor<span className="text-zinc-500 font-normal ml-1">v2.4</span></span>}
        </h1>
      </div>
      <nav className="flex-1 px-2 space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex items-center rounded-lg text-sm tracking-wide uppercase transition-colors duration-200",
              isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-3",
              location.pathname === item.path
                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300 border border-transparent"
            )}
            title={isCollapsed ? item.name : undefined}
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {!isCollapsed && <span className="font-medium">{item.name}</span>}
          </Link>
        ))}
      </nav>
      {!isCollapsed && (
        <div className="p-4 border-t border-zinc-800 text-xs text-zinc-500 text-center">
          Live Improvised Music Conduction
        </div>
      )}
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-black font-sans text-zinc-100 overflow-hidden select-none">
      <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
      <main className="flex-1 h-full overflow-y-auto p-4 transition-all duration-300">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/room" element={<ConductionRoom />} />
            <Route path="/setup" element={<GestureSetup />} />
          </Routes>
        </Layout>
      </Router>
    </AuthProvider>
  );
}

