import React, { useState, useRef, useEffect } from 'react';
import { z } from 'zod';
import {
  AgentActionProvider,
  AgentAction,
  AgentStep,
  useAgentActions,
} from '@mydatavalue/polter';

// ============================================================================
// Fake data
// ============================================================================

interface Customer {
  id: number;
  name: string;
  email: string;
  status: 'active' | 'trial' | 'churned';
  plan: string;
}

const ALL_CUSTOMERS: Customer[] = [
  { id: 1, name: 'Sarah Chen', email: 'sarah@acme.io', status: 'active', plan: 'Pro' },
  { id: 2, name: 'James Rivera', email: 'james@stellar.co', status: 'trial', plan: 'Free' },
  { id: 3, name: 'Priya Patel', email: 'priya@nexus.dev', status: 'active', plan: 'Enterprise' },
  { id: 4, name: 'Tom Anderson', email: 'tom@beacon.io', status: 'churned', plan: 'Pro' },
  { id: 5, name: 'Maya Tanaka', email: 'maya@drift.app', status: 'active', plan: 'Pro' },
  { id: 6, name: 'Alex Volkov', email: 'alex@horizon.co', status: 'trial', plan: 'Free' },
  { id: 7, name: 'Lina Okafor', email: 'lina@vertex.io', status: 'active', plan: 'Enterprise' },
];

// ============================================================================
// Dashboard
// ============================================================================

function Dashboard() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Customer['status'] | 'all'>('all');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const filtered = ALL_CUSTOMERS.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <main className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Customers</h1>
          <p className="dashboard-subtitle">{filtered.length} of {ALL_CUSTOMERS.length} customers</p>
        </div>
      </div>

      <div className="toolbar">
        <AgentAction
          name="search_customers"
          description="Search customers by name"
          parameters={z.object({ query: z.string().describe('Name to search for') })}
        >
          <AgentStep label="Type in search" setParam="query">
            <div className="search-box">
              <span>🔎</span>
              <input
                type="text"
                placeholder="Search customers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </AgentStep>
        </AgentAction>

        <AgentAction
          name="filter_by_status"
          description="Filter customers by status (active, trial, churned)"
          parameters={z.object({
            status: z.enum(['all', 'active', 'trial', 'churned']).describe('Status to filter by'),
          })}
          onExecute={(p) => setStatusFilter(p.status as Customer['status'] | 'all')}
        >
          <AgentStep label="Open status filter">
            <div className="dropdown">
              <button className="btn" onClick={() => setDropdownOpen((v) => !v)}>
                Status: {statusFilter} ▾
              </button>
              {dropdownOpen && (
                <div className="dropdown-menu">
                  {(['all', 'active', 'trial', 'churned'] as const).map((s) => (
                    <button
                      key={s}
                      className="dropdown-item"
                      onClick={() => {
                        setStatusFilter(s);
                        setDropdownOpen(false);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </AgentStep>
        </AgentAction>

        <AgentAction
          name="export_csv"
          description="Export all customers to CSV"
          onExecute={() => alert('Exported ' + filtered.length + ' customers to CSV')}
        >
          <button className="btn btn-primary">📥 Export CSV</button>
        </AgentAction>

        <AgentAction
          name="sync_data"
          description="Sync customer data from API"
          onExecute={() => alert('Synced data from API')}
        >
          <button className="btn">🔄 Sync</button>
        </AgentAction>
      </div>

      <div className="table">
        <div className="table-row header">
          <div>Name</div>
          <div>Email</div>
          <div>Status</div>
          <div>Plan</div>
        </div>
        {filtered.map((c) => (
          <div key={c.id} className="table-row">
            <div className="name">{c.name}</div>
            <div className="email">{c.email}</div>
            <div>
              <span className={'badge ' + c.status}>{c.status}</span>
            </div>
            <div>{c.plan}</div>
          </div>
        ))}
      </div>
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
    user: 'Export all customers to CSV',
    agent: "Sure! Here's where the export button is:",
    action: 'export_csv',
  },
  {
    user: 'Show only trial customers',
    agent: "Let me filter that for you:",
    action: 'filter_by_status',
    params: { status: 'trial' },
  },
  {
    user: 'Search for Sarah',
    agent: "Searching for Sarah:",
    action: 'search_customers',
    params: { query: 'Sarah' },
  },
  {
    user: 'Sync the latest data',
    agent: 'On it. Hitting the sync button:',
    action: 'sync_data',
  },
];

function AgentPanel() {
  const { execute, isExecuting } = useAgentActions();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'system', text: 'AI assistant ready. Try a suggestion below 👇' },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const runSuggestion = async (s: Suggestion) => {
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: s.user },
      { role: 'agent', text: s.agent },
    ]);
    // Small pause so the agent message shows before the spotlight starts
    await new Promise((r) => setTimeout(r, 400));
    await execute(s.action, s.params);
  };

  return (
    <aside className="agent-panel">
      <div className="agent-header">
        <h2>
          <span className="dot" />
          AI Assistant
        </h2>
        <p>Click a suggestion to watch the agent drive the UI</p>
      </div>

      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={'msg ' + m.role}>
            {m.text}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="suggestions">
        <div className="suggestions-label">Try these</div>
        {SUGGESTIONS.map((s) => (
          <button
            key={s.action + JSON.stringify(s.params)}
            className="suggestion"
            disabled={isExecuting}
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
// App
// ============================================================================

export default function App() {
  return (
    <AgentActionProvider mode="guided" stepDelay={700}>
      <div className="app">
        <Dashboard />
        <AgentPanel />
      </div>
    </AgentActionProvider>
  );
}
