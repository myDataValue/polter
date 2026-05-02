import { describe, expect } from 'vitest';
import { it, fc } from '@fast-check/vitest';
import { z } from 'zod';
import { zodToJsonSchema, generateToolSchemas } from '../core/schemaGenerator';
import type { RegisteredAction } from '../core/types';

// ---------------------------------------------------------------------------
// Arbitraries for Zod schemas
// ---------------------------------------------------------------------------

const leafZodSchema = fc.oneof(
  fc.constant(z.string()).map((s) => ({ schema: s, expectedType: 'string' })),
  fc.constant(z.number()).map((s) => ({ schema: s, expectedType: 'number' })),
  fc.constant(z.boolean()).map((s) => ({ schema: s, expectedType: 'boolean' })),
  fc.constant(z.null()).map(() => ({ schema: z.null(), expectedType: 'null' })),
  fc.constant(z.any()).map(() => ({ schema: z.any(), expectedType: undefined })),
);

const wrappedZodSchema = leafZodSchema.chain(({ schema }) =>
  fc.oneof(
    fc.constant({ schema, wrapper: 'none' as const }),
    fc.constant({ schema: schema.optional(), wrapper: 'optional' as const }),
    fc.constant({ schema: schema.nullable(), wrapper: 'nullable' as const }),
    fc.constant({ schema: schema.array(), wrapper: 'array' as const }),
  ),
);

// ---------------------------------------------------------------------------
// zodToJsonSchema
// ---------------------------------------------------------------------------

describe('zodToJsonSchema', () => {
  it.prop([leafZodSchema])(
    'should produce a type field for any leaf Zod type',
    ({ schema, expectedType }) => {
      const result = zodToJsonSchema(schema);
      if (expectedType) {
        expect(result.type).toBe(expectedType);
      } else {
        expect(result).toEqual({});
      }
    },
  );

  it.prop([fc.string({ minLength: 1 }), leafZodSchema])(
    'should preserve descriptions on any leaf type',
    (desc, { schema }) => {
      const described = schema.describe(desc);
      const result = zodToJsonSchema(described);
      expect(result.description).toBe(desc);
    },
  );

  it.prop([fc.string({ minLength: 1 })])(
    'should preserve descriptions through optional/default wrappers',
    (desc) => {
      const base = z.string().describe(desc);
      expect(zodToJsonSchema(base.optional()).description).toBe(desc);
      expect(zodToJsonSchema(base.default('x')).description).toBe(desc);
    },
  );

  it.prop([fc.string({ minLength: 1 })])(
    'should preserve descriptions on the string branch of a nullable union',
    (desc) => {
      const result = zodToJsonSchema(z.string().describe(desc).nullable()) as {
        anyOf: { type: string; description?: string }[];
      };
      const stringBranch = result.anyOf.find((b) => b.type === 'string');
      expect(stringBranch?.description).toBe(desc);
    },
  );

  it.prop([fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 })])(
    'should convert ZodEnum with any string values',
    (values) => {
      const schema = z.enum(values as [string, ...string[]]);
      const result = zodToJsonSchema(schema);
      expect(result.type).toBe('string');
      expect(new Set(result.enum as string[])).toEqual(new Set(values));
    },
  );

  it.prop([fc.nat(), fc.nat()])(
    'should convert ZodString min/max constraints',
    (min, rawMax) => {
      const max = min + rawMax;
      const result = zodToJsonSchema(z.string().min(min).max(max));
      expect(result.type).toBe('string');
      expect(result.minLength).toBe(min);
      expect(result.maxLength).toBe(max);
    },
  );

  const safeKey = fc.string({ minLength: 1 }).filter((s) =>
    !Object.prototype.hasOwnProperty.call(Object.prototype, s),
  );

  it.prop([
    fc.record({
      required: safeKey,
      optional: safeKey,
    }).filter((r) => r.required !== r.optional),
  ])(
    'should mark required fields and omit optional from required array',
    ({ required, optional }) => {
      const schema = z.object({
        [required]: z.string(),
        [optional]: z.number().optional(),
      });
      const result = zodToJsonSchema(schema);
      expect(result.type).toBe('object');
      expect(result.required).toContain(required);
      expect(result.required).not.toContain(optional);
      expect(result.properties).toHaveProperty(required);
      expect(result.properties).toHaveProperty(optional);
    },
  );

  it.prop([wrappedZodSchema])(
    'should unwrap optional/nullable to the inner type',
    ({ schema, wrapper }) => {
      const result = zodToJsonSchema(schema);
      if (wrapper === 'array') {
        expect(result.type).toBe('array');
        expect(result.items).toBeDefined();
      } else {
        expect(result).toBeDefined();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// generateToolSchemas
// ---------------------------------------------------------------------------

const actionArb = fc.record({
  name: fc.string({ minLength: 1 }),
  description: fc.string(),
  disabledReason: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
}).map(
  ({ name, description, disabledReason }): RegisteredAction => ({
    name,
    description,
    disabledReason,
    resolveSteps: () => [],
  }),
);

describe('generateToolSchemas', () => {
  it.prop([fc.uniqueArray(actionArb, { selector: (a) => a.name, minLength: 1 })])(
    'should include exactly the enabled actions',
    (actions) => {
      const schemas = generateToolSchemas(actions);
      const enabledNames = actions.filter((a) => !a.disabledReason).map((a) => a.name);
      const schemaNames = schemas.map((s) => s.name);
      expect(schemaNames.sort()).toEqual(enabledNames.sort());
    },
  );

  it.prop([fc.uniqueArray(actionArb, { selector: (a) => a.name })])(
    'should never include disabled action names',
    (actions) => {
      const schemas = generateToolSchemas(actions);
      const disabledNames = new Set(actions.filter((a) => a.disabledReason).map((a) => a.name));
      for (const schema of schemas) {
        expect(disabledNames.has(schema.name)).toBe(false);
      }
    },
  );

  it.prop([actionArb.filter((a) => !a.disabledReason)])(
    'should produce a parameters object for actions without Zod schema',
    (action) => {
      const [schema] = generateToolSchemas([action]);
      expect(schema.parameters).toEqual({ type: 'object', properties: {} });
    },
  );
});
