import { CLOUDBASE_ENV_ID } from '@/utils/runtime-env'

const H5_DEV_FUNCTION_PROXY_BASE = '/__tcb_functions__'
const isH5DevProxyRuntime = Boolean(import.meta.env.DEV) && typeof window !== 'undefined'

export const BASE_URL = isH5DevProxyRuntime
  ? H5_DEV_FUNCTION_PROXY_BASE
  : `https://${CLOUDBASE_ENV_ID}.api.tcloudbasegateway.com/v1/functions`
