export const APP_ENV =
  import.meta.env.VITE_APP_ENV || (import.meta.env.DEV ? 'development' : 'production')
export const CLOUDBASE_ENV_ID =
  import.meta.env.VITE_CLOUDBASE_ENV_ID || 'cloud1-2grufevs395a9d5e'

export function isDevelopmentAppEnv() {
  return ['dev', 'development', 'cloud1_dev'].includes(String(APP_ENV).toLowerCase())
}

export function getRequestAppEnvHeader() {
  return isDevelopmentAppEnv() ? 'development' : 'production'
}
