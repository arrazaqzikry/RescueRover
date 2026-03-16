// ===================================================
// components/ActivityLog.tsx — Terminal-style CoT log
// ===================================================

import React, { useEffect, useRef } from 'react';
import { LogEntry, LogLevel } from '../types/simulation';

interface Props {
  entries: LogEntry[];
}

const LEVEL_STYLE: Record<LogLevel, string> = {
  info:    'text-slate-300',
  agent:   'text-cyan-300',
  action:  'text-blue-300',
  detect:  'text-rescue-green font-bold',
  warn:    'text-alert-amber',
  success: 'text-rescue-green font-bold',
};

const LEVEL_PREFIX: Record<LogLevel, string> = {
  info:    '  ',
  agent:   '◈ ',
  action:  '→ ',
  detect:  '★ ',
  warn:    '! ',
  success: '✓ ',
};

export const ActivityLog: React.FC<Props> = ({ entries }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'hsl(var(--terminal-dark))' }}
    >
      {/* Terminal header */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 shrink-0"
        style={{ background: 'hsl(var(--terminal-bg))' }}
      >
        <div className="flex gap-1">
          <div className="w-2 h-2 rounded-full bg-critical-red/70" />
          <div className="w-2 h-2 rounded-full bg-alert-amber/70" />
          <div className="w-2 h-2 rounded-full bg-rescue-green/70" />
        </div>
        <span className="font-mono text-[10px] text-muted-foreground tracking-widest ml-1">
          COMMAND AGENT — CHAIN-OF-THOUGHT LOG
        </span>
        <span className="ml-auto font-mono text-[9px] text-muted-foreground">
          {entries.length} entries
        </span>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto terminal-scroll p-2 font-mono text-[10px] leading-relaxed">
        {entries.length === 0 && (
          <div className="text-muted-foreground py-4 text-center">
            Awaiting mission deployment...
          </div>
        )}
        {entries.map((entry, i) => (
          <div
            key={entry.id}
            className={`log-entry flex gap-1.5 hover:bg-white/3 px-1 py-0.5 rounded ${LEVEL_STYLE[entry.level]}`}
            style={{ animationDelay: `${(i % 10) * 10}ms` }}
          >
            <span className="shrink-0 text-muted-foreground/50 w-8">
              {String(entry.tick).padStart(3, '0')}
            </span>
            <span className="shrink-0">{LEVEL_PREFIX[entry.level]}</span>
            <span className="break-all">{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
