import { useEffect } from 'react';
import type { ExecutionResult, AvailableAction, ToolSchema } from '../core/types';
import { useAgentActions } from '../hooks/useAgentActions';

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  id?: string;
}

export interface WebSocketAdapterOptions {
  url?: string;
  socket?: WebSocket;
  parseToolCalls: (data: unknown) => ToolCall[] | null;
  formatResponse?: (toolCall: ToolCall, result: ExecutionResult) => unknown;
  formatStateUpdate?: (actions: AvailableAction[], schemas: ToolSchema[]) => unknown;
}

export interface WebSocketAdapter {
  connect: (
    execute: (name: string, params?: Record<string, unknown>) => Promise<ExecutionResult>,
  ) => void;
  sendStateUpdate: (actions: AvailableAction[], schemas: ToolSchema[]) => void;
  disconnect: () => void;
}

export function createWebSocketAdapter(options: WebSocketAdapterOptions): WebSocketAdapter {
  let ws: WebSocket | null = null;
  let executeFn:
    | ((name: string, params?: Record<string, unknown>) => Promise<ExecutionResult>)
    | null = null;

  function handleMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data);
      const toolCalls = options.parseToolCalls(data);
      if (!toolCalls || !executeFn) return;

      for (const call of toolCalls) {
        executeFn(call.name, call.arguments).then((result) => {
          if (options.formatResponse && ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(options.formatResponse(call, result)));
          }
        });
      }
    } catch {
      // Ignore non-JSON messages
    }
  }

  return {
    connect(execute) {
      executeFn = execute;

      if (options.socket) {
        ws = options.socket;
      } else if (options.url) {
        ws = new WebSocket(options.url);
      } else {
        throw new Error('WebSocketAdapter: provide either url or socket');
      }

      ws.addEventListener('message', handleMessage);
    },

    sendStateUpdate(actions, schemas) {
      if (!ws || ws.readyState !== WebSocket.OPEN || !options.formatStateUpdate) return;
      ws.send(JSON.stringify(options.formatStateUpdate(actions, schemas)));
    },

    disconnect() {
      ws?.removeEventListener('message', handleMessage);
      if (options.url && ws) {
        ws.close();
      }
      ws = null;
      executeFn = null;
    },
  };
}

export function useWebSocketAdapter(
  adapter: WebSocketAdapter | null,
  options?: { autoSendState?: boolean },
) {
  const { execute, availableActions, schemas } = useAgentActions();

  useEffect(() => {
    if (!adapter) return;
    adapter.connect(execute);
    return () => adapter.disconnect();
  }, [adapter, execute]);

  useEffect(() => {
    if (!adapter || !options?.autoSendState) return;
    adapter.sendStateUpdate(availableActions, schemas);
  }, [adapter, availableActions, schemas, options?.autoSendState]);

  return {
    sendStateUpdate: () => adapter?.sendStateUpdate(availableActions, schemas),
  };
}
