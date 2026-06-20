import { fc, it } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import { defineAction, fromParam } from '../core/helpers';

describe('defineAction', () => {
  it.prop([fc.string({ minLength: 1 }), fc.string()])(
    'should preserve name and description for any input',
    (name, description) => {
      const action = defineAction({ name, description });
      expect(action.name).toBe(name);
      expect(action.description).toBe(description);
      expect(action.navigateTo).toBeUndefined();
      expect(action.parameters).toBeUndefined();
    },
  );

  it.prop([fc.string({ minLength: 1 }), fc.string({ minLength: 1 })])(
    'should include navigateTo target',
    (name, target) => {
      const action = defineAction({ name, description: 'test', navigateTo: target });
      expect(action.navigateTo).toBe(target);
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
