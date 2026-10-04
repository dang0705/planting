import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findProjectRoot } from './project-root.js'
import { diagnosisPublicResultFixture } from './diagnosis-public-result-fixture.js'
import { lockQuestionPackageSnapshot } from '../../src/diagnosis/domain/question-package-snapshot.js'
const questions = JSON.parse(
  readFileSync(
    join(findProjectRoot(), 'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'),
    'utf8'
  )
)
const questionPackage = lockQuestionPackageSnapshot({
  contractVersion: 'diagnosis-question-package-snapshot/v1',
  mode: 'yellow_leaf',
  questionPackageReleaseRef: 'bpr_test12345',
  questionCount: questions.fixed.yellow_leaf.length,
  packageQuestions: questions.fixed.yellow_leaf
})
export function resultFixture() {
  return {
    contractVersion: 'diagnosis-result-record/v1',
    publicResult: structuredClone(diagnosisPublicResultFixture),
    replay: {
      knowledgeReleaseRef: 'dkr_fixture123',
      knowledgePackageSha256: 'a'.repeat(64),
      questionPackage: structuredClone(questionPackage),
      inputSnapshot: {
        contractVersion: 'diagnosis-replay-input/v1',
        plantIdentityRef: null,
        capturedAtMs: 1500,
        evidences: [
          {
            evidenceRef: 'ev_observation123',
            kind: 'visual',
            schemaVersion: 'fixture-visible-observation/v1',
            occurredAtMs: 1000,
            content: { observationZh: '局部叶尖变化' },
            contentSha256: createHash('sha256')
              .update(JSON.stringify({ observationZh: '局部叶尖变化' }))
              .digest('hex')
          }
        ]
      },
      decisionTrace: {
        contractVersion: 'diagnosis-decision-trace/v1',
        outcomes: [
          {
            outcomeCode: 'unconfirmed',
            causeCode: 'undetermined',
            disposition: 'selected',
            reasonZh: '现有证据不足',
            evidenceRefs: ['ev_observation123'],
            sourceClaimRefs: [
              {
                sourceCode: 'source_fixture',
                claimCode: 'claim_fixture',
                revisionNo: 1,
                linkRole: 'support'
              }
            ]
          }
        ],
        actions: [
          {
            actionCode: 'inspect_fixture',
            mappingCode: 'mapping_fixture',
            outcomeCode: 'unconfirmed',
            disposition: 'proposed',
            reasonZh: '补充观察',
            evidenceRefs: ['ev_observation123'],
            sourceClaimRefs: [
              {
                sourceCode: 'source_fixture',
                claimCode: 'claim_fixture',
                revisionNo: 1,
                linkRole: 'support'
              }
            ],
            gates: {
              applicability: 'pass',
              evidence: 'pass',
              contraindications: 'pass',
              risk: 'pass'
            },
            publicActionIndex: 0
          }
        ],
        assessment: {
          certainty: {
            value: diagnosisPublicResultFixture.certaintyLevel,
            reasonZh: diagnosisPublicResultFixture.certaintyReasonZh
          },
          severity: {
            value: diagnosisPublicResultFixture.severityLevel,
            reasonZh: diagnosisPublicResultFixture.severityReasonZh
          },
          urgency: {
            value: diagnosisPublicResultFixture.urgencyLevel,
            reasonZh: diagnosisPublicResultFixture.urgencyReasonZh
          },
          isolation: {
            value: diagnosisPublicResultFixture.isolationDecision,
            reasonZh: diagnosisPublicResultFixture.isolationReasonZh
          }
        }
      },
      ruleReleaseRef: 'rules_fixture/v1',
      ruleReleaseSha256: 'b'.repeat(64),
      modelBinding: null
    }
  }
}
