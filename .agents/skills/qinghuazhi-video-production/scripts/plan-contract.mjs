import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJsonSchema } from './json-schema-lite.mjs';
import { validatePlan } from './plan-validator.mjs';

const SKILL_ROOT =
  fileURLToPath(
    new URL('..', import.meta.url)
  );

export const PLAN_SCHEMA_PATH =
  resolve(
    SKILL_ROOT,
    'assets/plan.schema.json'
  );

export const PLAN_TEMPLATE_PATH =
  resolve(
    SKILL_ROOT,
    'assets/plan.template.json'
  );

let schemaPromise = null;

export async function loadPlanSchema() {
  schemaPromise ??= readFile(PLAN_SCHEMA_PATH, 'utf8').then(JSON.parse);
  return await schemaPromise;
}

export async function validatePlanContract(
  plan,
  expectedContentId = null,
  expectedPlatforms = null
) {
  const schema = await loadPlanSchema();
  const schemaErrors = validateJsonSchema(plan, schema);
  const businessErrors = validatePlan(
    plan,
    expectedContentId,
    expectedPlatforms
  );

  return {
    schemaErrors,
    businessErrors,
    errors: [
      ...schemaErrors.map(error => `Schema: ${error}`),
      ...businessErrors.map(error => `Business: ${error}`)
    ]
  };
}
