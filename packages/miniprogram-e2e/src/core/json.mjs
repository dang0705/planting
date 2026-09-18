import { readFile } from 'node:fs/promises'

/** @param {string} file */
export async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (cause) {
    const error = new Error(`invalid JSON: ${file}`)
    error.code = 'mp_e2e_invalid_json'
    error.cause = cause
    throw error
  }
}

/** @param {unknown} value */
export function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
