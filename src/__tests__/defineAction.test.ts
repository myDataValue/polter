import { describe, expect } from 'vitest';
import { it, fc } from '@fast-check/vitest';
import { defineAction } from '../core/helpers';
import { fromParam } from '../core/helpers';

describe('defineAction', () => {
  it.prop([fc.string({ minLength: 1 }), fc.string()])(
    'should preserve name and description for any input',
    (name, description) => {
      const action = defineAction({ name, description });
      expect(action.name).toBe(name);
      expect(action.description).toBe(description);
      expect(action.steps).toBeUndefined();
      expect(action.route).toBeUndefined();
      expect(action.parameters).toBeUndefined();
    },
  );

  it.prop([
    fc.string({ minLength: 1 }),
    fc.array(fc.record({ label: fc.string(), target: fc.string() }), { minLength: 1 }),
  ])(
    'should include steps with correct targets',
    (name, steps) => {
      const action = defineAction({ name, description: 'test', steps });
      expect(action.steps).toHaveLength(steps.length);
      for (let i = 0; i < steps.length; i++) {
        expect(action.steps![i].label).toBe(steps[i].label);
        expect(action.steps![i].target).toBe(steps[i].target);
      }
    },
  );
});

describe('fromParam', () => {
  it.prop([fc.string({ minLength: 1 }), fc.string()])(
    'should return String(value) when param is present',
    (paramName, value) => {
      const fn = fromParam(paramName);
      expect(fn({ [paramName]: value })).toBe(value);
    },
  );

  it.prop([fc.string({ minLength: 1 }), fc.oneof(fc.integer(), fc.double({ noNaN: true }))])(
    'should stringify numeric values',
    (paramName, value) => {
      const fn = fromParam(paramName);
      expect(fn({ [paramName]: value })).toBe(String(value));
    },
  );

  it.prop([fc.string({ minLength: 1 }), fc.array(fc.integer())])(
    'should stringify arrays',
    (paramName, value) => {
      const fn = fromParam(paramName);
      expect(fn({ [paramName]: value })).toBe(String(value));
    },
  );

  it.prop([fc.string({ minLength: 1 })])(
    'should return undefined when param is absent',
    (paramName) => {
      const fn = fromParam(paramName);
      expect(fn({})).toBeUndefined();
    },
  );
});
