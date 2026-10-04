import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from 'vitest'
import { pestCreationMysqlHarness } from './pest-creation-idempotency-mysql.js'
import { createIdempotentPestDiagnosisCreationService } from '../../src/diagnosis/application/idempotent-create-diagnosis.js'
import { projectPestDiagnosisCreationResponse } from '../../src/diagnosis/http/pest-create-session-contract.js'
import {
  createDiagnosisCreationRouteHandler,
  diagnosisCreationRoute
} from '../../src/diagnosis/http/create-session-route.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import type { UserPrincipalDto } from '../../src/contracts/types.js'

/** e2e_real_api/L3：真实本地HTTP→共享事务→隔离MySQL；身份解析和模型准备为替身，非云端发布证明。 */
export function registerPestCreationHttpMysqlTests(dependencies: {
  readonly atomicDependencies: () => {
    source: Parameters<typeof pestCreationMysqlHarness>[0]
    run: Parameters<typeof pestCreationMysqlHarness>[1]
  }
  readonly counts: () => Promise<unknown>
}) {
  test('虫害真实HTTP创建→MySQL读回→重放，换图冲突且安全字段脱敏', async () => {
    const { source, run: create } = dependencies.atomicDependencies()
    const h = pestCreationMysqlHarness(source, create)
    const service = createIdempotentPestDiagnosisCreationService({
      ...h.dependencies,
      projectPublicResponse: projectPestDiagnosisCreationResponse
    })
    const audits: unknown[] = []
    const handler = createDiagnosisCreationRouteHandler({
      resolvePrincipal: async command =>
        ({
          principalType: 'user',
          user_id: command.bearerToken === 'owner-token' ? 'usr_owner123' : 'usr_other123'
        }) as UserPrincipalDto,
      createSession: async () => {
        throw new Error('不能误用固定症状')
      },
      createPestSession: service,
      now: () => 1500,
      writeAudit: event => {
        audits.push(event)
      }
    })
    const server = createServer(createRouteDispatcher([{ route: diagnosisCreationRoute, handler }]))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v2/diagnosis/sessions`
      const body = {
        userPlantRef: 'upl_owner123',
        mode: 'specific_pest_visual',
        assetRef: 'upa_owner123'
      }
      const post = (value = body, key = 'pest-http-create', token = 'owner-token') =>
        fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
            'idempotency-key': key
          },
          body: JSON.stringify(value)
        })
      const before = await dependencies.counts(),
        first = await post()
      expect(first.status).toBe(200)
      const result = (await first.json()) as any
      expect(result.data.mode).toBe('specific_pest_visual')
      expect(result.data.diagnosisSessionRef).toMatch(/^dia_[a-f0-9]{32}$/)
      expect(result.data.questionPackage.questionCount).toBe(2)
      expect(
        result.data.questionPackage.questions.some((q: any) => q.requiresExplicitConsent)
      ).toBe(true)
      expect(
        result.data.questionPackage.questions.every(
          (q: any) => q.skipOptionEnabled && q.riskNotice && q.safetyInstructions.length
        )
      ).toBe(true)
      const replay = await post()
      expect(replay.status).toBe(200)
      expect(await replay.json()).toEqual(result)
      expect((await post({ ...body, assetRef: 'upa_different123' })).status).toBe(409)
      const after = await dependencies.counts()
      expect(after).toEqual([
        {
          sessions: Number((before as any)[0].sessions) + 1,
          visuals: Number((before as any)[0].visuals) + 1
        }
      ])
      const wrongUser = await post(body, 'pest-http-other', 'other-token')
      expect(wrongUser.status).toBe(404)
      expect(await dependencies.counts()).toEqual(after)
      expect((await post({ ...body, tier: 'high' } as any, 'pest-http-forged')).status).toBe(400)
      expect(JSON.stringify(result)).not.toMatch(
        /bpr_pest12345|snapshotSha256|assetRef|_openid|routeKey|mapsToModes|private-file-never-public/
      )
      expect(JSON.stringify(audits)).not.toMatch(/owner-token|other-token|upa_owner123/)
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
}
