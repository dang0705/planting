import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'

/** unit_fake / L3：固定答案路由制品在临时目录生成，仅读取指定生成器，不执行真实架构扫描。 */
test('重新生成保留答案精确合同，其他会话操作不冒充答案确认',()=>{
 const directory=mkdtempSync(join(tmpdir(),'qhz-answer-openapi-'))
 try{
  writeFileSync(join(directory,'generate-openapi.mjs'),readFileSync(join(findProjectRoot(),'docs/backend-v2/api/generate-openapi.mjs')))
  const route={method:'POST',path:'/api/v2/diagnosis/sessions/{diagnosisSessionRef}/answers',operationId:'answerDiagnosisQuestion',owner:'diagnosis',phase:'P4',security:'guest_or_authenticated',requestContract:'DiagnosisAnswerRequest',responseContract:'DiagnosisSessionResponse',idempotency:'required_header',errors:['VALIDATION_FAILED','PRINCIPAL_INVALID','IDEMPOTENCY_CONFLICT']}
  writeFileSync(join(directory,'route-registry.json'),JSON.stringify({generatedAt:'2026-10-05T00:00:00+08:00',routes:[route,{...route,method:'GET',path:'/api/v2/diagnosis/sessions/{diagnosisSessionRef}',operationId:'getDiagnosisSession',requestContract:'EmptyRequest',idempotency:'not_required'}]}))
  const run=spawnSync(process.execPath,[join(directory,'generate-openapi.mjs')],{encoding:'utf8'})
  expect(run.status,run.stderr).toBe(0)
  const generated=JSON.parse(readFileSync(join(directory,'openapi.p1.json'),'utf8'))
  const operation=generated.paths[route.path].post
  expect(operation.requestBody.content['application/json'].schema).toEqual({$ref:'#/components/schemas/DiagnosisAnswerRequest'})
  expect(operation.responses['200'].content['application/json'].schema).toEqual({$ref:'#/components/schemas/DiagnosisSessionAnswerResponse'})
  expect(generated.components.schemas.DiagnosisAnswerRequest.required).toEqual(['userPlantRef','requestMode','answers'])
  expect(generated.components.schemas.DiagnosisSessionAnswerResponse.properties.data.required).toEqual(['diagnosisSessionRef','answersRecorded'])
  expect(generated.paths['/api/v2/diagnosis/sessions/{diagnosisSessionRef}'].get.responses['200'].content['application/json'].schema).toEqual({$ref:'#/components/schemas/SuccessEnvelope'})
 }finally{rmSync(directory,{recursive:true,force:true})}
})
