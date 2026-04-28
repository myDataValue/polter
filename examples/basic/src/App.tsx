import React, { useState, useRef, useEffect } from 'react';
import { z } from 'zod';
import {
  AgentActionProvider,
  AgentTarget,
  AgentDevTools,
  defineAction,
  useAgentAction,
  useAgentActions,
} from '@mydatavalue/polter';

// ============================================================================
// Toast (tiny zero-dep notification system)
// ============================================================================

interface ToastMessage {
  id: number;
  text: string;
}

let toastIdCounter = 0;
let toastState: ToastMessage[] = [];
const toastListeners = new Set<(messages: ToastMessage[]) => void>();

function emitToasts() {
  toastListeners.forEach((listener) => listener(toastState));
}

function showToast(text: string) {
  const id = ++toastIdCounter;
  toastState = [...toastState, { id, text }];
  emitToasts();
  setTimeout(() => {
    toastState = toastState.filter((m) => m.id !== id);
    emitToasts();
  }, 3500);
}

function Toaster() {
  const [messages, setMessages] = useState<ToastMessage[]>(toastState);
  useEffect(() => {
    toastListeners.add(setMessages);
    return () => {
      toastListeners.delete(setMessages);
    };
  }, []);
  return (
    <div className="toaster">
      {messages.map((m) => (
        <div key={m.id} className="toast">
          {m.text}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Fake data
// ============================================================================

interface Customer {
  id: number;
  name: string;
  email: string;
  status: 'active' | 'trial' | 'churned';
  plan: string;
  joined: string;
  mrr: number;
}

const ALL_CUSTOMERS: Customer[] = [
  { id: 1, name: 'Sarah Chen', email: 'sarah@acme.io', status: 'active', plan: 'Pro', joined: 'Mar 2024', mrr: 99 },
  { id: 2, name: 'James Rivera', email: 'james@stellar.co', status: 'trial', plan: 'Free', joined: 'Jan 2026', mrr: 0 },
  { id: 3, name: 'Priya Patel', email: 'priya@nexus.dev', status: 'active', plan: 'Enterprise', joined: 'Sep 2023', mrr: 499 },
  { id: 4, name: 'Tom Anderson', email: 'tom@beacon.io', status: 'churned', plan: 'Pro', joined: 'May 2023', mrr: 0 },
  { id: 5, name: 'Maya Tanaka', email: 'maya@drift.app', status: 'active', plan: 'Pro', joined: 'Feb 2025', mrr: 99 },
  { id: 6, name: 'Alex Volkov', email: 'alex@horizon.co', status: 'trial', plan: 'Free', joined: 'Jan 2026', mrr: 0 },
  { id: 7, name: 'Lina Okafor', email: 'lina@vertex.io', status: 'active', plan: 'Enterprise', joined: 'Jul 2023', mrr: 499 },
];

// ============================================================================
// Action definitions
// ============================================================================

const findAndEmail = defineAction({
  name: 'find_and_email',
  description: 'Find a customer by name, open their record, and draft an email',
  parameters: z.object({ name: z.string().describe('Full customer name') }),
});

const filterAndExport = defineAction({
  name: 'filter_and_export',
  description: 'Filter customers by status and export the result to CSV',
  parameters: z.object({
    status: z.enum(['all', 'active', 'trial', 'churned']).describe('Status to filter by'),
  }),
});

// ============================================================================
// Dashboard
// ============================================================================

function Dashboard() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Customer['status'] | 'all'>('all');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);

  const filtered = ALL_CUSTOMERS.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  useAgentAction([
    {
      action: findAndEmail,
      steps: [
        { label: 'Type the name', setParam: 'name', fromTarget: 'search', skipIf: ({ name }) => selected?.name === name || search === name },
        { label: 'Open status filter', fromTarget: 'status-toggle', skipIf: ({ name }) => filtered.some((c) => c.name === name) || statusFilter === 'all' || dropdownOpen },
        { label: 'Reset to all', fromParam: 'status', defaultValue: 'all', skipIf: ({ name }) => filtered.some((c) => c.name === name) || statusFilter === 'all' },
        { label: 'Click the customer', fromParam: 'name', skipIf: ({ name }) => selected?.name === name },
        { label: "Click 'Send email'", fromTarget: 'send-email-btn' },
      ],
    },
    {
      action: filterAndExport,
      steps: [
        { label: 'Clear search', setParam: 'search', defaultValue: '', fromTarget: 'search', skipIf: () => search === '' },
        { label: 'Open status filter', fromTarget: 'status-toggle', skipIf: ({status}) => statusFilter === status || dropdownOpen },
        { label: 'Pick a status', fromParam: 'status', skipIf: ({status}) => statusFilter === status },
        { label: 'Click export', fromTarget: 'export-btn' },
      ],
    },
  ]);

  return (
    <main className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Customers</h1>
          <p className="dashboard-subtitle">
            {filtered.length} of {ALL_CUSTOMERS.length} customers
          </p>
        </div>
        <a href="https://mydatavalue.github.io/polter/" className="back-link">
          polter docs
        </a>
      </div>

      <div className="toolbar">
        <AgentTarget name="search">
          <div className="search-box">
            <span>🔎</span>
            <input
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </AgentTarget>

        <div className="dropdown">
          <AgentTarget name="status-toggle">
            <button
              className="btn"
              onClick={() => setDropdownOpen((v) => !v)}
            >
              Status: {statusFilter} ▾
            </button>
          </AgentTarget>
          {dropdownOpen && (
            <div className="dropdown-menu">
              {(['all', 'active', 'trial', 'churned'] as const).map((s) => (
                <AgentTarget key={s} param="status" value={s}>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setStatusFilter(s);
                      setDropdownOpen(false);
                    }}
                  >
                    {s}
                  </button>
                </AgentTarget>
              ))}
            </div>
          )}
        </div>

        <AgentTarget name="export-btn">
          <button
            className="btn btn-primary"
            onClick={() => showToast('✨ Exported customers to CSV')}
          >
            📥 Export CSV
          </button>
        </AgentTarget>
      </div>

      <div className="table">
        <div className="table-row header">
          <div>Name</div>
          <div>Email</div>
          <div>Status</div>
          <div>Plan</div>
        </div>
        {filtered.map((c) => (
          <AgentTarget key={c.id} action="find_and_email" param="name" value={c.name}>
            <div
              className="table-row table-row-clickable"
              onClick={() => setSelected(c)}
            >
              <div className="name">{c.name}</div>
              <div className="email">{c.email}</div>
              <div>
                <span className={'badge ' + c.status}>{c.status}</span>
              </div>
              <div>{c.plan}</div>
            </div>
          </AgentTarget>
        ))}
      </div>

      {/* Customer detail modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selected.name}</h2>
              <button className="modal-close" onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-row">
                <span className="detail-label">Email</span>
                <span>{selected.email}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Status</span>
                <span className={'badge ' + selected.status}>{selected.status}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Plan</span>
                <span>{selected.plan}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Joined</span>
                <span>{selected.joined}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">MRR</span>
                <span>${selected.mrr}/mo</span>
              </div>
            </div>
            <div className="modal-footer">
              <AgentTarget action="find_and_email" name="send-email-btn">
                <button
                  className="btn btn-primary"
                  onClick={() => showToast(`✨ AI: Drafting email to ${selected.email}`)}
                >
                  ✉️ Send email
                </button>
              </AgentTarget>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ============================================================================
// Fake agent panel
// ============================================================================

interface ChatMessage {
  role: 'user' | 'agent' | 'system';
  text: string;
}

interface Suggestion {
  user: string;
  agent: string;
  action: string;
  params?: Record<string, unknown>;
}

const SUGGESTIONS: Suggestion[] = [
  {
    user: 'Find Sarah Chen and draft an email to her',
    agent: "On it. Let me search for her, open her record, and draft the email:",
    action: 'find_and_email',
    params: { name: 'Sarah Chen' },
  },
  {
    user: 'Filter to only active customers and export them',
    agent: "Sure — I'll filter the list and run the export:",
    action: 'filter_and_export',
    params: { status: 'active' },
  },
];

function AgentPanel() {
  const { execute, isExecuting } = useAgentActions();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'system', text: 'AI assistant ready. Try a prompt below 👇' },
  ]);
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const runSuggestion = async (s: Suggestion) => {
    setMessages((prev) => [...prev, { role: 'user', text: s.user }]);
    setIsThinking(true);
    await new Promise((r) => setTimeout(r, 1200));
    setIsThinking(false);
    setMessages((prev) => [...prev, { role: 'agent', text: s.agent }]);
    await new Promise((r) => setTimeout(r, 350));
    await execute(s.action, s.params);
  };

  return (
    <aside className="agent-panel">
      <div className="agent-header">
        <h2>
          <span className="dot" />
          AI Assistant
        </h2>
        <p>Click a prompt and watch the agent drive the UI</p>
      </div>

      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={'msg ' + m.role}>
            {m.text}
          </div>
        ))}
        {isThinking && (
          <div className="msg agent">
            <span className="typing-dots" aria-label="Agent thinking">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="suggestions">
        <div className="suggestions-label">Try these</div>
        {SUGGESTIONS.map((s) => (
          <button
            key={s.action + JSON.stringify(s.params)}
            className="suggestion"
            disabled={isExecuting || isThinking}
            onClick={() => runSuggestion(s)}
          >
            {s.user}
          </button>
        ))}
      </div>
    </aside>
  );
}

// ============================================================================
// Execution badge — persistent "🤖 Agent executing" pill at the top of the
// viewport whenever the agent is driving the UI. The single most important
// visual cue that the clicks aren't coming from a human.
// ============================================================================

function ExecutionBadge() {
  const { isExecuting } = useAgentActions();
  if (!isExecuting) return null;
  return (
    <div className="exec-badge" role="status" aria-live="polite">
      <span className="exec-badge-icon">🤖</span>
      <span>Agent executing</span>
    </div>
  );
}

// ============================================================================
// App
// ============================================================================

export default function App() {
  return (
    <AgentActionProvider mode="guided" stepDelay={700}>
      <div className="app">
        <Dashboard />
        <AgentPanel />
      </div>
      <ExecutionBadge />
      <Toaster />
      <AgentDevTools />
    </AgentActionProvider>
  );
}
