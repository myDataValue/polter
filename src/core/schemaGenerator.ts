import { z } from 'zod';
import type { RegisteredAction, ToolSchema } from './types';

type JsonSchema = Record<string, unknown>;

export function zodToJsonSchema(schema: z.ZodType): JsonSchema {
  const result = z.toJSONSchema(schema) as JsonSchema;
  delete result.$schema;
  return result;
}

export function generateToolSchemas(actions: RegisteredAction[]): ToolSchema[] {
  return actions
    .filter((a) => !a.disabledReason)
    .map((action) => ({
      name: action.name,
      description: action.description,
      parameters: action.parameters
        ? zodToJsonSchema(action.parameters)
        : { type: 'object' as const, properties: {} },
    }));
}
