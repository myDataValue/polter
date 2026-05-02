import type { ToolSchema } from './types';

type JsonSchema = Record<string, unknown>;

interface SchemaInput {
  readonly name: string;
  readonly description: string;
  readonly parameters?: unknown;
  readonly disabledReason?: string;
}

export function zodToJsonSchema(schema: unknown): JsonSchema {
  // Zod v4+: use built-in toJSONSchema() if available
  if (typeof (schema as any).toJSONSchema === 'function') {
    try {
      const result = (schema as any).toJSONSchema();
      // Remove $schema key — not needed for tool schemas
      delete result.$schema;
      return result;
    } catch {
      // Fall through to manual conversion
    }
  }

  // Zod v3: manual conversion via _def.typeName
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def;
  const description = (schema as any).description;

  switch (def.typeName) {
    case 'ZodString': {
      const result: JsonSchema = { type: 'string' };
      if (description) result.description = description;
      if (def.checks) {
        for (const check of def.checks) {
          if (check.kind === 'min') result.minLength = check.value;
          if (check.kind === 'max') result.maxLength = check.value;
        }
      }
      return result;
    }

    case 'ZodNumber': {
      const result: JsonSchema = { type: 'number' };
      if (description) result.description = description;
      if (def.checks) {
        for (const check of def.checks) {
          if (check.kind === 'int') result.type = 'integer';
          if (check.kind === 'min')
            result[check.inclusive ? 'minimum' : 'exclusiveMinimum'] = check.value;
          if (check.kind === 'max')
            result[check.inclusive ? 'maximum' : 'exclusiveMaximum'] = check.value;
        }
      }
      return result;
    }

    case 'ZodBoolean': {
      const result: JsonSchema = { type: 'boolean' };
      if (description) result.description = description;
      return result;
    }

    case 'ZodArray': {
      const result: JsonSchema = {
        type: 'array',
        items: zodToJsonSchema(def.type),
      };
      if (description) result.description = description;
      if (def.minLength !== null && def.minLength !== undefined)
        result.minItems = def.minLength.value;
      if (def.maxLength !== null && def.maxLength !== undefined)
        result.maxItems = def.maxLength.value;
      return result;
    }

    case 'ZodObject': {
      const shape = def.shape();
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value);
        if (!(value as any).isOptional()) {
          required.push(key);
        }
      }

      const result: JsonSchema = { type: 'object', properties };
      if (required.length > 0) result.required = required;
      if (description) result.description = description;
      return result;
    }

    case 'ZodEnum': {
      const result: JsonSchema = { type: 'string', enum: [...def.values] };
      if (description) result.description = description;
      return result;
    }

    case 'ZodLiteral': {
      const result: JsonSchema = { type: typeof def.value, const: def.value };
      if (description) result.description = description;
      return result;
    }

    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': {
      const options = def.options as unknown[];
      const result: JsonSchema = { anyOf: options.map((o) => zodToJsonSchema(o)) };
      if (description) result.description = description;
      return result;
    }

    case 'ZodOptional': {
      const inner = zodToJsonSchema(def.innerType);
      if (description && !inner.description) inner.description = description;
      return inner;
    }

    case 'ZodNullable': {
      const inner = zodToJsonSchema(def.innerType);
      if (description && !inner.description) inner.description = description;
      return inner;
    }

    case 'ZodDefault': {
      const inner = zodToJsonSchema(def.innerType);
      if (description && !inner.description) inner.description = description;
      return inner;
    }

    case 'ZodRecord': {
      const result: JsonSchema = {
        type: 'object',
        additionalProperties: zodToJsonSchema(def.valueType),
      };
      if (description) result.description = description;
      return result;
    }

    case 'ZodNull': {
      return { type: 'null', ...(description && { description }) };
    }

    case 'ZodAny':
    case 'ZodUnknown': {
      return description ? { description } : {};
    }

    default: {
      return { type: 'object', ...(description && { description }) };
    }
  }
}

export function generateToolSchemas(actions: SchemaInput[]): ToolSchema[] {
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

