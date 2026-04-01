import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAgentActions } from '../hooks/useAgentActions';
import type { AvailableAction, ExecutionResult } from '../core/types';

interface AgentDevToolsProps {
  /** Initial position. Default: bottom-right. */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Default collapsed state. */
  defaultCollapsed?: boolean;
}

interface LogEntry {
  id: number;
  action: string;
  params?: Record<string, unknown>;
  result?: ExecutionResult;
  timestamp: number;
}

let logId = 0;

export function AgentDevTools({
  position = 'bottom-right',
  defaultCollapsed = true,
}: AgentDevToolsProps) {
  const { availableActions, execute, isExecuting, mode } = useAgentActions();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [paramInputs, setParamInputs] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  const handleExecute = useCallback(async (action: AvailableAction) => {
    const entryId = ++logId;
    let params: Record<string, unknown> | undefined;

    const raw = paramInputs[action.name];
    if (raw) {
      try {
        params = JSON.parse(raw);
      } catch {
        setLog(prev => [...prev, {
          id: entryId, action: action.name, timestamp: Date.now(),
          result: { success: false, actionName: action.name, error: 'Invalid JSON params' },
        }]);
        return;
      }
    }

    setLog(prev => [...prev, { id: entryId, action: action.name, params, timestamp: Date.now() }]);
    const result = await execute(action.name, params);
    setLog(prev => prev.map(e => e.id === entryId ? { ...e, result } : e));
  }, [execute, paramInputs]);

  const positionStyle = {
    'bottom-right': { bottom: 12, right: 12 } as const,
    'bottom-left': { bottom: 12, left: 12 } as const,
    'top-right': { top: 12, right: 12 } as const,
    'top-left': { top: 12, left: 12 } as const,
  }[position];

  const filtered = filter
    ? availableActions.filter(a => a.name.includes(filter) || a.description.includes(filter))
    : availableActions;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: 'fixed', ...positionStyle, zIndex: 99990,
          width: 40, height: 40, borderRadius: '50%',
          background: '#3b82f6', color: 'white', border: 'none',
          cursor: 'pointer', fontSize: 18, fontWeight: 700,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="Agent DevTools"
      >
        A
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', ...positionStyle, zIndex: 99990,
      width: 380, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      background: '#0f172a', color: '#e2e8f0', borderRadius: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)', fontSize: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', background: '#1e293b', borderBottom: '1px solid #334155',
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          Agent DevTools
          <span style={{ marginLeft: 8, fontSize: 10, color: '#94a3b8' }}>
            {availableActions.length} actions | {mode}
          </span>
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setLog([])}
            style={headerBtnStyle}
            title="Clear log"
          >
            Clear
          </button>
          <button
            onClick={() => setCollapsed(true)}
            style={headerBtnStyle}
            title="Collapse"
          >
            _
          </button>
        </div>
      </div>

      {/* Filter */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid #334155' }}>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter actions..."
          style={{
            width: '100%', background: '#1e293b', border: '1px solid #475569',
            borderRadius: 4, padding: '4px 8px', color: '#e2e8f0', fontSize: 11,
            outline: 'none',
          }}
        />
      </div>

      {/* Actions list */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, maxHeight: 280 }}>
        {filtered.map(action => (
          <div key={action.name} style={{
            padding: '6px 12px', borderBottom: '1px solid #1e293b',
            opacity: action.disabled ? 0.5 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: '#93c5fd', fontSize: 11 }}>{action.name}</div>
                <div style={{ color: '#94a3b8', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {action.disabled ? `[disabled] ${action.disabledReason ?? ''}` : action.description}
                </div>
              </div>
              <button
                onClick={() => handleExecute(action)}
                disabled={action.disabled || isExecuting}
                style={{
                  padding: '3px 10px', borderRadius: 4, border: 'none', fontSize: 10,
                  fontWeight: 600, cursor: action.disabled ? 'not-allowed' : 'pointer',
                  background: action.disabled ? '#475569' : '#3b82f6', color: 'white',
                  flexShrink: 0,
                }}
              >
                {isExecuting ? '...' : 'Run'}
              </button>
            </div>
            {action.hasParameters && (
              <input
                value={paramInputs[action.name] ?? ''}
                onChange={e => setParamInputs(prev => ({ ...prev, [action.name]: e.target.value }))}
                placeholder='{"key": "value"}'
                style={{
                  width: '100%', marginTop: 4, background: '#1e293b', border: '1px solid #475569',
                  borderRadius: 3, padding: '3px 6px', color: '#e2e8f0', fontSize: 10,
                  outline: 'none',
                }}
              />
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 12, color: '#64748b', textAlign: 'center' }}>
            {filter ? 'No matching actions' : 'No actions registered'}
          </div>
        )}
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div style={{
          borderTop: '1px solid #334155', maxHeight: 150, overflowY: 'auto',
          background: '#020617',
        }}>
          {log.map(entry => (
            <div key={entry.id} style={{
              padding: '4px 12px', fontSize: 10, borderBottom: '1px solid #0f172a',
              color: entry.result
                ? entry.result.success ? '#4ade80' : '#f87171'
                : '#fbbf24',
            }}>
              <span style={{ color: '#64748b' }}>
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              {' '}{entry.action}
              {entry.params && <span style={{ color: '#64748b' }}> {JSON.stringify(entry.params)}</span>}
              {entry.result && (
                <span>
                  {' '}{entry.result.success ? 'OK' : `ERR: ${entry.result.error}`}
                </span>
              )}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}

const headerBtnStyle: React.CSSProperties = {
  padding: '2px 8px', borderRadius: 3, border: '1px solid #475569',
  background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 10,
};
