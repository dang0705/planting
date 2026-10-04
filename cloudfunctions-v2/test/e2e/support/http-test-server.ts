import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

/** 启动测试 HTTP 服务并返回其随机本机端口地址。 */
export async function listenTestServer(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(Number('0'), '127.0.0.1', () => resolve())
  })
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${String(address.port)}`
}

/** 安全停止测试 HTTP 服务，不清理或接触任何外部云资源。 */
export async function closeTestServer(server: Server | undefined): Promise<void> {
  if (!server?.listening) {
    return
  }
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()))
  })
}
