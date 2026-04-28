/**
 * Migration helper: produces a `value` function that extracts a named param.
 *
 * @example
 * // Before:  { label: 'Type name', setParam: 'name', target: 'search' }
 * // After:   { label: 'Type name', value: fromParam('name'), target: 'search' }
 */
export function fromParam(
  paramName: string,
): (params: Record<string, unknown>) => string | undefined {
  return (params) => {
    if (!Object.prototype.hasOwnProperty.call(params, paramName)) return undefined;
    return String(params[paramName]);
  };
}
