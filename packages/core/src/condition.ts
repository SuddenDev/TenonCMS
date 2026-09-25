// This file MUST have no imports. The admin bundles it.

export type ConditionValue = string | number | boolean | null

/** Comparisons for one field. All given operators MUST match. */
export type Operators = {
  /** Equal to the value. A plain value instead of an operator object means `eq`. */
  eq?: ConditionValue
  /** Not equal to the value. */
  ne?: ConditionValue
  /** Equal to one of the values. */
  in?: readonly ConditionValue[]
  /** Equal to none of the values. */
  notIn?: readonly ConditionValue[]
  /** Greater than. Numbers compare with numbers, strings (e.g. dates) with strings. Other values never match. */
  gt?: number | string
  /** Greater than or equal. */
  gte?: number | string
  /** Less than. */
  lt?: number | string
  /** Less than or equal. */
  lte?: number | string
  /** `true`: the field has a value. `false`: it is missing, `null` or `''`. */
  exists?: boolean
}

/**
 * When a field applies. Each key is a field path and each value a plain value (`eq`) or {@link Operators}.
 * Several keys MUST all match.
 * - `field`: a sibling field. At the top level a field of the document, inside a group a field of that group.
 * - `/field`, `/group.field`: a path from the document root. Dots walk into groups.
 * - `$every`: every condition in the list MUST match.
 * - `$some`: at least one condition in the list MUST match.
 * @example
 * condition: { mediaType: 'youtube' }
 * condition: { price: { gt: 0 } }
 * condition: { $some: [{ mediaType: 'video' }, { mediaType: 'youtube' }] }
 * condition: { '/settings.mode': 'advanced' }
 */
export type Condition = {
  $every?: readonly Condition[]
  $some?: readonly Condition[]
  [path: string]: ConditionValue | Operators | readonly Condition[] | undefined
}

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function test(value: unknown, ops: Operators) {
  const v = value ?? null
  const comparable = (a: unknown) => v !== null && typeof v === typeof a
  return Object.entries(ops).every(([op, a]) => {
    switch (op) {
      case 'eq':
        return v === a
      case 'ne':
        return v !== a
      case 'in':
        return (a as unknown[]).includes(v)
      case 'notIn':
        return !(a as unknown[]).includes(v)
      case 'gt':
        return comparable(a) && (v as number) > (a as number)
      case 'gte':
        return comparable(a) && (v as number) >= (a as number)
      case 'lt':
        return comparable(a) && (v as number) < (a as number)
      case 'lte':
        return comparable(a) && (v as number) <= (a as number)
      case 'exists':
        return (v !== null && v !== '') === a
      default:
        return false
    }
  })
}

/** Whether `condition` matches. Core and admin MUST both use this function, so they agree on which fields apply. */
export function matchCondition(condition: Condition, data: unknown, siblingData: unknown = data): boolean {
  return Object.entries(condition).every(([key, c]) => {
    if (c === undefined) return true
    if (key === '$every') return (c as Condition[]).every((x) => matchCondition(x, data, siblingData))
    if (key === '$some') return (c as Condition[]).some((x) => matchCondition(x, data, siblingData))
    const value = key.startsWith('/') ? get(data, key.slice(1)) : get(siblingData, key)
    return test(value, isObject(c) ? c : { eq: c as ConditionValue })
  })
}

function get(data: unknown, path: string) {
  return path.split('.').reduce<unknown>((v, k) => (isObject(v) ? v[k] : undefined), data)
}
