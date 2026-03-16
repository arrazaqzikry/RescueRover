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
  detect:  'text-fuchsia-300 font-bold',
  warn:    'text-alert-amber',
  success: 'text-rescue-green font-bold',
};

const LEVEL_TAG: Record<LogLevel, string> = {
  info:    'INFO',
  agent:   'AGENT',
  action:  'ACTION',
  detect:  'DETECT',
  warn:    'WARN',
  success: 'SUCCESS',
};

const TAG_STYLE: Record<LogLevel, string> = {
  info:    'text-slate-400 border-slate-600',
  agent:   'text-cyan-400 border-cyan-800',
  action:  'text-blue-400 border-blue-800',
  detect:  'text-fuchsia-400 border-fuchsia-700',
  warn:    'text-alert-amber border-alert-amber/40',
  success: 'text-rescue-green border-rescue-green/40',
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return [
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0'),
  ].join(':');
}

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
          COMMAND AGENT — ACTIVITY LOG
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
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`log-entry flex gap-1.5 hover:bg-white/3 px-1 py-0.5 rounded ${LEVEL_STYLE[entry.level]}`}
          >
            {/* Timestamp */}
            <span className="shrink-0 text-muted-foreground/60 w-14">
              {formatTimestamp(entry.timestamp)}
            </span>
            {/* Level tag */}
            <span
              className={`shrink-0 w-13 border px-1 rounded text-[8px] flex items-center justify-center font-bold tracking-widest
                ${TAG_STYLE[entry.level]}`}
              style={{ minWidth: '46px', maxWidth: '46px' }}
            >
              {LEVEL_TAG[entry.level]}
            </span>
            {/* Message */}
            <span className="break-all">{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
