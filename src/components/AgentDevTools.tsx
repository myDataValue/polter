import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAgentActions } from '../hooks/useAgentActions';
import type { AvailableAction, ExecutionResult, StepTrace, ToolSchema } from '../core/types';

interface AgentDevToolsProps {
  /** Default open state. */
  defaultOpen?: boolean;
  /** Offset from the bottom of the viewport (px). Raise to avoid overlapping a chat panel. */
  bottomOffset?: number;
}

interface LogEntry {
  id: number;
  action: string;
  params?: Record<string, unknown>;
  result?: ExecutionResult;
  timestamp: number;
}

let logId = 0;

const PANEL_WIDTH = 440;

/**
 * Extract parameter fields from a schema's JSON Schema properties.
 */
function getSchemaFields(
  schemas: ToolSchema[],
  actionName: string,
): { name: string; type: string; description?: string; enumValues?: string[]; isRequired: boolean }[] {
  const schema = schemas.find((s) => s.name === actionName);
  if (!schema?.parameters) return [];

  const params = schema.parameters as Record<string, unknown>;
  const properties = (params.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = ((params.required ?? []) as string[]);

  return Object.entries(properties).map(([name, prop]) => ({
    name,
    type: (prop.type as string) ?? 'string',
    description: prop.description as string | undefined,
    enumValues: prop.enum as string[] | undefined,
    isRequired: required.includes(name),
  }));
}

export function AgentDevTools({ defaultOpen = false, bottomOffset = 0 }: AgentDevToolsProps) {
  const { availableActions, execute, isExecuting, mode, schemas } = useAgentActions();
  const [open, setOpen] = useState(defaultOpen);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [paramInputs, setParamInputs] = useState<Record<string, Record<string, string>>>({});
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<'actions' | 'log'>('actions');
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tab === 'log') logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log, tab]);

  const setFieldValue = useCallback((actionName: string, fieldName: string, value: string) => {
    setParamInputs((prev) => ({
      ...prev,
      [actionName]: { ...prev[actionName], [fieldName]: value },
    }));
  }, []);

  const handleExecute = useCallback(
    async (action: AvailableAction) => {
      const entryId = ++logId;
      let params: Record<string, unknown> | undefined;

      const fields = getSchemaFields(schemas, action.name);
      const rawInputs = paramInputs[action.name];

      if (fields.length > 0 && rawInputs) {
        params = {};
        for (const field of fields) {
          const raw = rawInputs[field.name];
          if (raw === undefined || raw === '') continue;

          if (field.type === 'number' || field.type === 'integer') {
            params[field.name] = Number(raw);
          } else if (field.type === 'boolean') {
            params[field.name] = raw === 'true';
          } else if (field.type === 'array') {
            try {
              params[field.name] = JSON.parse(raw);
            } catch {
              setLog((prev) => [
                ...prev,
                {
                  id: entryId,
                  action: action.name,
                  timestamp: Date.now(),
                  result: { success: false, actionName: action.name, error: `Invalid JSON for ${field.name}`, trace: [], durationMs: 0 },
                },
              ]);
              return;
            }
          } else {
            params[field.name] = raw;
          }
        }
      }

      setLog((prev) => [...prev, { id: entryId, action: action.name, params, timestamp: Date.now() }]);
      const result = await execute(action.name, params);
      setLog((prev) => prev.map((e) => (e.id === entryId ? { ...e, result } : e)));
    },
    [execute, paramInputs, schemas],
  );

  const filtered = filter
    ? availableActions.filter((a) => a.name.includes(filter) || a.description.includes(filter))
    : availableActions;

  // Toggle button
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          bottom: 16 + bottomOffset,
          right: 16,
          zIndex: 99990,
          height: 36,
          paddingLeft: 12,
          paddingRight: 14,
          borderRadius: 18,
          border: 'none',
          cursor: 'pointer',
          background: '#3b82f6',
          color: 'white',
          fontSize: 13,
          fontWeight: 600,
          fontFamily: 'system-ui, sans-serif',
          boxShadow: '0 2px 12px rgba(59,130,246,0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 16 }}>&#9881;</span>
        Agent · {availableActions.length}
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99989,
          background: 'rgba(0,0,0,0.15)',
        }}
      />

      {/* Side panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: bottomOffset,
          zIndex: 99990,
          width: PANEL_WIDTH,
          display: 'flex',
          flexDirection: 'column',
          background: '#0f172a',
          color: '#e2e8f0',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 13,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1e293b',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Agent DevTools</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {availableActions.length} actions registered · {mode} mode
            </div>
          </div>
          <button onClick={() => setOpen(false)} style={closeBtnStyle}>
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1e293b' }}>
          <button onClick={() => setTab('actions')} style={tabStyle(tab === 'actions')}>
            Actions
          </button>
          <button onClick={() => setTab('log')} style={tabStyle(tab === 'log')}>
            Log {log.length > 0 && `(${log.length})`}
          </button>
        </div>

        {/* Content */}
        {tab === 'actions' ? (
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {/* Filter */}
            <div style={{ padding: '12px 20px' }}>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter actions..."
                style={filterInputStyle}
              />
            </div>

            {filtered.length > 0 && filtered.map((action) => (
              <ActionRow
                key={action.name}
                action={action}
                schemas={schemas}
                expanded={expandedAction === action.name}
                onToggle={() => setExpandedAction(expandedAction === action.name ? null : action.name)}
                fieldValues={paramInputs[action.name] ?? {}}
                onFieldChange={(field, value) => setFieldValue(action.name, field, value)}
                onRun={() => handleExecute(action)}
                isExecuting={isExecuting}
              />
            ))}

            {filtered.length === 0 && (
              <div style={{ padding: 20, color: '#475569', textAlign: 'center' }}>
                {filter ? 'No matching actions' : 'No actions registered'}
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {log.length === 0 ? (
              <div style={{ padding: 20, color: '#475569', textAlign: 'center' }}>
                No executions yet. Run an action to see results here.
              </div>
            ) : (
              <>
                <div style={{ padding: '8px 20px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setLog([])} style={clearBtnStyle}>
                    Clear
                  </button>
                </div>
                {log.map((entry) => (
                  <div key={entry.id} style={{ padding: '10px 20px', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StatusDot result={entry.result} />
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{entry.action}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}>
                        {entry.result?.durationMs != null && `${(entry.result.durationMs / 1000).toFixed(1)}s · `}
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {entry.params && <pre style={logParamsStyle}>{JSON.stringify(entry.params, null, 2)}</pre>}
                    {entry.result && !entry.result.success && (
                      <div style={{ marginTop: 4, fontSize: 12, color: '#f87171' }}>{entry.result.error}</div>
                    )}
                    {entry.result?.trace && entry.result.trace.length > 0 && (
                      <div style={{ marginTop: 6, borderTop: '1px solid #1e293b', paddingTop: 6 }}>
                        {entry.result.trace.map((step) => (
                          <div key={step.index} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', fontSize: 11 }}>
                            <StepStatusIcon status={step.status} />
                            <span style={{ color: '#64748b', minWidth: 16 }}>{step.index + 1}.</span>
                            <span style={{
                              color: step.status === 'failed' ? '#f87171' : step.status === 'skipped' ? '#475569' : '#e2e8f0',
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {step.label}
                              {step.targetName && (
                                <span style={{ color: '#64748b', marginLeft: 6, fontSize: 10 }}>
                                  {step.targetType}:{step.targetName}
                                </span>
                              )}
                            </span>
                            <span style={{ color: '#475569', fontSize: 10, flexShrink: 0 }}>
                              {step.durationMs < 1 ? '<1ms' : `${Math.round(step.durationMs)}ms`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={logEndRef} />
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function ActionRow({
  action,
  schemas,
  expanded,
  onToggle,
  fieldValues,
  onFieldChange,
  onRun,
  isExecuting,
  badge,
}: {
  action: AvailableAction;
  schemas: ToolSchema[];
  expanded: boolean;
  onToggle: () => void;
  fieldValues: Record<string, string>;
  onFieldChange: (field: string, value: string) => void;
  onRun: () => void;
  isExecuting: boolean;
  badge?: string;
}) {
  const fields = getSchemaFields(schemas, action.name);

  return (
    <div
      style={{
        padding: '10px 20px',
        borderBottom: '1px solid #1e293b',
        opacity: action.disabled ? 0.5 : 1,
        cursor: 'pointer',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && expanded && !action.disabled && !isExecuting) {
          e.preventDefault();
          onRun();
        }
      }}
    >
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#475569', fontSize: 10, flexShrink: 0 }}>{expanded ? '\u25BC' : '\u25B6'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600, color: '#93c5fd' }}>{action.name}</span>
            {badge && (
              <span
                style={{
                  fontSize: 9,
                  padding: '1px 5px',
                  borderRadius: 3,
                  background: '#1e3a5f',
                  color: '#60a5fa',
                  fontWeight: 600,
                }}
              >
                {badge}
              </span>
            )}
            {action.disabled && (
              <span
                style={{
                  fontSize: 9,
                  padding: '1px 5px',
                  borderRadius: 3,
                  background: '#3f1d1d',
                  color: '#f87171',
                  fontWeight: 600,
                }}
              >
                disabled
              </span>
            )}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
            {action.disabled && action.disabledReason ? action.disabledReason : action.description}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRun();
          }}
          disabled={action.disabled || isExecuting}
          style={{
            padding: '5px 14px',
            borderRadius: 6,
            border: 'none',
            fontSize: 12,
            fontWeight: 600,
            cursor: action.disabled ? 'not-allowed' : 'pointer',
            background: action.disabled ? '#334155' : '#3b82f6',
            color: 'white',
            flexShrink: 0,
          }}
        >
          {isExecuting ? '···' : 'Run'}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, marginLeft: 18 }}>
          {fields.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {fields.map((field) => (
                <div key={field.name}>
                  <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 }}>
                    {field.name}
                    {field.isRequired && <span style={{ color: '#f87171', marginLeft: 2 }}>*</span>}
                    {field.description && (
                      <span style={{ color: '#475569', marginLeft: 6 }}>{field.description}</span>
                    )}
                  </label>
                  {field.enumValues ? (
                    <select
                      value={fieldValues[field.name] ?? ''}
                      onChange={(e) => onFieldChange(field.name, e.target.value)}
                      style={fieldSelectStyle}
                    >
                      <option value="">Select...</option>
                      {field.enumValues.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'boolean' ? (
                    <select
                      value={fieldValues[field.name] ?? ''}
                      onChange={(e) => onFieldChange(field.name, e.target.value)}
                      style={fieldSelectStyle}
                    >
                      <option value="">Select...</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : field.type === 'array' ? (
                    <textarea
                      value={fieldValues[field.name] ?? ''}
                      onChange={(e) => onFieldChange(field.name, e.target.value)}
                      placeholder='[1, 2, 3]'
                      rows={2}
                      style={textareaStyle}
                    />
                  ) : (
                    <input
                      type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'}
                      value={fieldValues[field.name] ?? ''}
                      onChange={(e) => onFieldChange(field.name, e.target.value)}
                      placeholder={field.description ?? field.name}
                      style={fieldInputStyle}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#475569' }}>No parameters</div>
          )}
        </div>
      )}
    </div>
  );
}


function StatusDot({ result }: { result?: ExecutionResult }) {
  const color = !result ? '#fbbf24' : result.success ? '#4ade80' : '#f87171';
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  );
}

const stepStatusSymbols: Record<StepTrace['status'], string> = { completed: '\u2713', skipped: '\u25CB', failed: '\u2717' };
const stepStatusColors: Record<StepTrace['status'], string> = { completed: '#4ade80', skipped: '#475569', failed: '#f87171' };

function StepStatusIcon({ status }: { status: StepTrace['status'] }) {
  return (
    <span style={{ fontSize: 10, color: stepStatusColors[status], flexShrink: 0, width: 12, textAlign: 'center' }}>
      {stepStatusSymbols[status]}
    </span>
  );
}

const closeBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: '1px solid #334155',
  background: 'transparent',
  color: '#94a3b8',
  cursor: 'pointer',
  fontSize: 14,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const tabStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '10px 0',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'inherit',
  background: active ? '#1e293b' : 'transparent',
  color: active ? '#e2e8f0' : '#64748b',
  borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
});

const filterInputStyle: React.CSSProperties = {
  width: '100%',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '8px 12px',
  color: '#e2e8f0',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
};

const clearBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 4,
  border: '1px solid #334155',
  background: 'transparent',
  color: '#64748b',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'inherit',
};

const fieldInputStyle: React.CSSProperties = {
  width: '100%',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '7px 10px',
  color: '#e2e8f0',
  fontSize: 12,
  outline: 'none',
  fontFamily: 'inherit',
};

const fieldSelectStyle: React.CSSProperties = {
  width: '100%',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '7px 10px',
  color: '#e2e8f0',
  fontSize: 12,
  outline: 'none',
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '8px 10px',
  color: '#e2e8f0',
  fontSize: 12,
  outline: 'none',
  resize: 'vertical',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const logParamsStyle: React.CSSProperties = {
  marginTop: 4,
  padding: '6px 8px',
  background: '#1e293b',
  borderRadius: 4,
  fontSize: 11,
  color: '#94a3b8',
  overflow: 'auto',
  maxHeight: 80,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};
