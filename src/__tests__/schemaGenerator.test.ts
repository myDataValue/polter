import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  zodToJsonSchema,
  generateToolSchemas,
} from '../core/schemaGenerator';
import type { RegisteredAction } from '../core/types';

describe('zodToJsonSchema', () => {
  it('converts ZodString', () => {
    expect(zodToJsonSchema(z.string())).toEqual({ type: 'string' });
  });

  it('converts ZodString with description', () => {
    expect(zodToJsonSchema(z.string().describe('A name'))).toEqual({
      type: 'string',
      description: 'A name',
    });
  });

  it('converts ZodString with min/max', () => {
    expect(zodToJsonSchema(z.string().min(1).max(100))).toEqual({
      type: 'string',
      minLength: 1,
      maxLength: 100,
    });
  });

  it('converts ZodNumber', () => {
    expect(zodToJsonSchema(z.number())).toEqual({ type: 'number' });
  });

  it('converts ZodNumber with int check', () => {
    expect(zodToJsonSchema(z.number().int())).toEqual({ type: 'integer' });
  });

  it('converts ZodNumber with min/max', () => {
    expect(zodToJsonSchema(z.number().min(0).max(100))).toEqual({
      type: 'number',
      minimum: 0,
      maximum: 100,
    });
  });

  it('converts ZodBoolean', () => {
    expect(zodToJsonSchema(z.boolean())).toEqual({ type: 'boolean' });
  });

  it('converts ZodArray', () => {
    expect(zodToJsonSchema(z.array(z.string()))).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('converts ZodObject with required and optional fields', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().optional(),
    });
    expect(zodToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name'],
    });
  });

  it('converts ZodEnum', () => {
    expect(zodToJsonSchema(z.enum(['a', 'b', 'c']))).toEqual({
      type: 'string',
      enum: ['a', 'b', 'c'],
    });
  });

  it('converts ZodLiteral', () => {
    expect(zodToJsonSchema(z.literal('fixed'))).toEqual({
      type: 'string',
      const: 'fixed',
    });
  });

  it('converts ZodOptional (unwraps inner type)', () => {
    expect(zodToJsonSchema(z.string().optional())).toEqual({ type: 'string' });
  });

  it('converts ZodNullable (unwraps inner type)', () => {
    expect(zodToJsonSchema(z.string().nullable())).toEqual({ type: 'string' });
  });

  it('converts ZodDefault (unwraps inner type)', () => {
    expect(zodToJsonSchema(z.string().default('hello'))).toEqual({ type: 'string' });
  });

  it('converts ZodUnion', () => {
    const schema = z.union([z.string(), z.number()]);
    expect(zodToJsonSchema(schema)).toEqual({
      anyOf: [{ type: 'string' }, { type: 'number' }],
    });
  });

  it('converts ZodRecord', () => {
    expect(zodToJsonSchema(z.record(z.number()))).toEqual({
      type: 'object',
      additionalProperties: { type: 'number' },
    });
  });

  it('converts ZodNull', () => {
    expect(zodToJsonSchema(z.null())).toEqual({ type: 'null' });
  });

  it('converts ZodAny', () => {
    expect(zodToJsonSchema(z.any())).toEqual({});
  });

  it('converts nested objects', () => {
    const schema = z.object({
      filter: z.object({
        field: z.string(),
        value: z.number(),
      }),
    });
    expect(zodToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            value: { type: 'number' },
          },
          required: ['field', 'value'],
        },
      },
      required: ['filter'],
    });
  });

  it('preserves descriptions through optional wrapper', () => {
    const schema = z.string().describe('user name').optional();
    expect(zodToJsonSchema(schema)).toEqual({
      type: 'string',
      description: 'user name',
    });
  });
});

describe('generateToolSchemas', () => {
  const makeAction = (overrides: Partial<RegisteredAction> = {}): RegisteredAction => ({
    name: 'test_action',
    description: 'Test action',
    disabled: false,
    getExecutionTargets: () => [],
    ...overrides,
  });

  it('generates schema for action without parameters', () => {
    const schemas = generateToolSchemas([makeAction()]);
    expect(schemas).toEqual([
      {
        name: 'test_action',
        description: 'Test action',
        parameters: { type: 'object', properties: {} },
      },
    ]);
  });

  it('generates schema for action with Zod parameters', () => {
    const schemas = generateToolSchemas([
      makeAction({
        name: 'sync',
        description: 'Sync data',
        parameters: z.object({
          property_ids: z.array(z.number()).describe('IDs to sync'),
        }),
      }),
    ]);
    expect(schemas[0].parameters).toEqual({
      type: 'object',
      properties: {
        property_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'IDs to sync',
        },
      },
      required: ['property_ids'],
    });
  });

  it('filters out disabled actions', () => {
    const schemas = generateToolSchemas([
      makeAction({ name: 'enabled', disabled: false }),
      makeAction({ name: 'disabled', disabled: true }),
    ]);
    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe('enabled');
  });
});

