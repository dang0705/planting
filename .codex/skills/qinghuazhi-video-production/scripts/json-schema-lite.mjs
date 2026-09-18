function typeName(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function joinPath(path, key) {
  return typeof key === 'number'
    ? `${path}[${key}]`
    : `${path}.${key}`;
}

export function validateJsonSchema(value, schema, path = '$') {
  const errors = [];

  function walk(current, rule, currentPath) {
    if (!rule || typeof rule !== 'object') return;

    if (rule.enum && !rule.enum.some(item => Object.is(item, current))) {
      errors.push(`${currentPath} 必须是：${rule.enum.map(String).join(' / ')}`);
      return;
    }

    if (rule.type) {
      const actual = typeName(current);
      const matches =
        rule.type === 'object'
          ? actual === 'object' && current !== null && !Array.isArray(current)
          : rule.type === actual;

      if (!matches) {
        errors.push(`${currentPath} 类型应为 ${rule.type}，实际为 ${actual}`);
        return;
      }
    }

    if (typeof current === 'string') {
      if (rule.minLength != null && current.length < rule.minLength) {
        errors.push(`${currentPath} 长度不能小于 ${rule.minLength}`);
      }
      if (rule.maxLength != null && current.length > rule.maxLength) {
        errors.push(`${currentPath} 长度不能大于 ${rule.maxLength}`);
      }
      if (rule.pattern && !(new RegExp(rule.pattern).test(current))) {
        errors.push(`${currentPath} 不符合 pattern=${rule.pattern}`);
      }
    }

    if (typeof current === 'number') {
      if (rule.minimum != null && current < rule.minimum) {
        errors.push(`${currentPath} 不能小于 ${rule.minimum}`);
      }
      if (rule.maximum != null && current > rule.maximum) {
        errors.push(`${currentPath} 不能大于 ${rule.maximum}`);
      }
    }

    if (Array.isArray(current)) {
      if (rule.minItems != null && current.length < rule.minItems) {
        errors.push(`${currentPath} 至少需要 ${rule.minItems} 项`);
      }
      if (rule.maxItems != null && current.length > rule.maxItems) {
        errors.push(`${currentPath} 最多允许 ${rule.maxItems} 项`);
      }
      if (rule.items) {
        current.forEach((item, index) => walk(item, rule.items, joinPath(currentPath, index)));
      }
      return;
    }

    if (current && typeof current === 'object') {
      const props = rule.properties ?? {};
      for (const key of rule.required ?? []) {
        if (!Object.hasOwn(current, key)) {
          errors.push(`${joinPath(currentPath, key)} 缺失`);
        }
      }

      if (rule.additionalProperties === false) {
        for (const key of Object.keys(current)) {
          if (!Object.hasOwn(props, key)) {
            errors.push(`${joinPath(currentPath, key)} 是未允许字段`);
          }
        }
      }

      for (const [key, subRule] of Object.entries(props)) {
        if (Object.hasOwn(current, key)) {
          walk(current[key], subRule, joinPath(currentPath, key));
        }
      }
    }
  }

  walk(value, schema, path);
  return errors;
}
