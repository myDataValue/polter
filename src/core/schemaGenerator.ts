import { z } from 'zod/v4';
import type { ToolSchema } from './types';

type JsonSchema = Record<string, unknown>;

interface SchemaInput {
  readonly name: string;
  readonly description: string;
  readonly parameters?: unknown;
  readonly disabledReason?: string;
}

export function zodToJsonSchema(schema: z.ZodType): JsonSchema {
  const result = z.toJSONSchema(schema) as JsonSchema;
  delete result.$schema;
  return result;
}

export function generateToolSchemas(actions: SchemaInput[]): ToolSchema[] {
  return actions
    .filter((a) => !a.disabledReason)
    .map((action) => ({
      name: action.name,
      description: action.description,
      parameters: action.parameters
        ? zodToJsonSchema(action.parameters as z.ZodType)
        : { type: 'object' as const, properties: {} },
    }));
}
