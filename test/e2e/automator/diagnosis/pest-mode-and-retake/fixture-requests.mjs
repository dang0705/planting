export async function installRequestFixture(miniProgram) {
  await miniProgram.evaluate(() => {
    const uniRef = (() => {
      try {
        return require('common/vendor.js')?.index || null
      } catch {
        return typeof uni !== 'undefined' ? uni : null
      }
    })()
    const wxRef = typeof wx !== 'undefined' ? wx : null
    const originalUniRequest = uniRef?.request
    const originalWxRequest = wxRef?.request
    const originalUniShowModal = uniRef?.showModal
    const originalWxShowModal = wxRef?.showModal
    globalThis.__e2eDiagnosisRequests = []
    globalThis.__e2eDiagnosisModals = []
    globalThis.__e2eDiagnosisOriginalUniRequest = originalUniRequest
    globalThis.__e2eDiagnosisOriginalWxRequest = originalWxRequest
    globalThis.__e2eDiagnosisOriginalUniShowModal = originalUniShowModal
    globalThis.__e2eDiagnosisOriginalWxShowModal = originalWxShowModal
    wxRef?.setStorageSync('__plantsight_e2e_diagnosis_requests__', [])
    wxRef?.setStorageSync('__plantsight_e2e_diagnosis_modals__', [])

    const pack = data => ({ code: 200, data })
    const clone = value => {
      try {
        return JSON.parse(JSON.stringify(value || null))
      } catch {
        return String(value)
      }
    }
    const appendStored = (key, value) => {
      if (!wxRef) {
        return
      }
      const current = wxRef.getStorageSync(key)
      const items = Array.isArray(current) ? current : []
      items.push(clone(value))
      wxRef.setStorageSync(key, items)
    }
    const packageResult = () => ({
      diagnosisSessionId: 'e2e_pest_session',
      roundId: 'round_2',
      stage: 'question_package',
      status: 'active',
      diagnosisProfile: 'pest',
      questionPackage: {
        mode: 'specific_pest_visual',
        packageKey: 'specific_pest_visual',
        answerSubmitMode: 'package',
        questionDisplayMode: 'package',
        questionCount: 1,
        candidateModes: ['spider_mite', 'whitefly'],
        hiddenPrefilledEvidence: [
          {
            evidenceKey: 'fine_webbing',
            diagnosisMode: 'spider_mite',
            routeEvidenceRole: 'confirmation_candidate'
          },
          {
            evidenceKey: 'white_flies',
            diagnosisMode: 'whitefly',
            routeEvidenceRole: 'confirmation_candidate'
          }
        ]
      },
      uiHints: {
        answerSubmitMode: 'package',
        questionDisplayMode: 'package',
        maxQuestionsThisRound: 1
      },
      questions: [
        {
          questionId: 'pest_risk_leaf_under',
          questionKey: 'pest_risk_leaf_under',
          questionTextUserCn: '请翻看叶背，确认是否还能看到活动小虫或细网。',
          riskNotice: '需要翻动叶片，不方便操作时可以跳过。',
          safetyInstructions: '动作放轻，避免折断叶片。',
          requiresExplicitConsent: true,
          defaultOptionId: 'unknown',
          options: [
            { optionId: 'positive', optionTextUserCn: '能看到' },
            { optionId: 'negative', optionTextUserCn: '没看到' },
            { optionId: 'unknown', optionTextUserCn: '不确定' }
          ]
        }
      ],
      answerRevision: 1
    })
    const fullQuestionStartPackageResult = () => ({
      diagnosisSessionId: 'e2e_full_question_session',
      roundId: 'round_1',
      roundIndex: 1,
      currentRoundIndex: 1,
      currentRoundId: 'round_1',
      stage: 'question_package',
      status: 'active',
      sessionStatus: 'awaiting_package_answers',
      diagnosisProfile: 'full',
      routePrimaryAction: 'ask_first',
      questionRequired: true,
      questionPackage: {
        mode: 'yellow_leaf',
        route: 'yellow_leaf',
        sourceMode: 'manual_yellowing_care_environment_frontloaded',
        questionCount: 3,
        packageTopics: [
          'watering_frequency_context',
          'light_change_context',
          'fertilization_growth_context'
        ],
        answerSubmitMode: 'package',
        questionDisplayMode: 'package',
        fixedQuestionPackage: true
      },
      uiHints: {
        canUploadMoreImages: false,
        maxQuestionsThisRound: 3,
        answerSubmitMode: 'package',
        questionDisplayMode: 'package',
        sourceMode: 'manual_yellowing_care_environment_frontloaded'
      },
      questions: [
        {
          questionId: 'watering_frequency_context',
          questionKey: 'watering_frequency_context',
          questionText: '最近浇水的频率大致如何？',
          text: '最近浇水的频率大致如何？',
          defaultOptionId: 'unknown',
          options: [
            { optionId: 'often', optionKey: 'often', text: '浇得比较勤' },
            { optionId: 'moderate', optionKey: 'moderate', text: '按土壤干湿浇水' },
            { optionId: 'unknown', optionKey: 'unknown', text: '不确定' }
          ]
        },
        {
          questionId: 'light_change_context',
          questionKey: 'light_change_context',
          questionText: '最近光照环境是否有明显变化？',
          text: '最近光照环境是否有明显变化？',
          defaultOptionId: 'unknown',
          options: [
            { optionId: 'yes', optionKey: 'yes', text: '有明显变化' },
            { optionId: 'no', optionKey: 'no', text: '没有明显变化' },
            { optionId: 'unknown', optionKey: 'unknown', text: '不确定' }
          ]
        },
        {
          questionId: 'fertilization_growth_context',
          questionKey: 'fertilization_growth_context',
          questionText: '最近是否施肥或出现生长变化？',
          text: '最近是否施肥或出现生长变化？',
          defaultOptionId: 'unknown',
          options: [
            { optionId: 'yes', optionKey: 'yes', text: '有' },
            { optionId: 'no', optionKey: 'no', text: '没有' },
            { optionId: 'unknown', optionKey: 'unknown', text: '不确定' }
          ]
        }
      ],
      metrics: {
        questionStartPath: 'static_question_package'
      }
    })
    const retakeRequestResult = () => ({
      diagnosisSessionId: 'e2e_pest_session',
      roundId: 'round_3',
      stage: 'intermediate',
      status: 'active',
      diagnosisProfile: 'pest',
      retakeRequest: {
        status: 'needs_confirmation',
        requestedCaptureRegion: 'leaf_lower_surface',
        reason: 'specific_pest_confirmation_needed',
        howToCapture: '靠近叶背拍清楚，保持画面稳定。',
        riskLevel: 'medium',
        riskNotice: '需要翻动叶片，虫体可能受惊移动。',
        safetyInstructions: ['动作放轻，避免折断叶片。', '不方便操作时直接跳过。'],
        requiresExplicitConsent: true,
        skipOptionEnabled: true,
        skipAnswerValue: 'unknown'
      },
      uiHints: { canUploadMoreImages: false },
      answerRevision: 2
    })
    const retakeAuthorization = () => {
      const serverNow = Date.now()
      const expired =
        wxRef?.getStorageSync('__plantsight_e2e_diagnosis_retake_mode__') === 'expired'
      return {
        status: 'active',
        retakeAuthorizationId: 'e2e_retake_authorized',
        requestedCaptureRegion: 'leaf_lower_surface',
        originVisualCallBatchId: 'e2e_visual_batch_initial',
        serverNow,
        retakeStartedAt: serverNow,
        retakeExpiresAt: expired ? serverNow - 1000 : serverNow + 180000
      }
    }
    const skippedRetakeResult = () => ({
      ...retakeRequestResult(),
      stage: 'result',
      status: 'closed',
      sessionStatus: 'completed',
      stopReason: 'retake_skipped_unknown',
      outcomeType: 'uncertain',
      retakeRequest: {
        ...retakeRequestResult().retakeRequest,
        status: 'skipped_unknown',
        answerValue: 'unknown'
      },
      retakeAuthorizationState: {
        status: 'skipped_unknown',
        answerValue: 'unknown',
        serverNow: Date.now()
      },
      finalResult: {
        resultId: 'e2e_pest_session_retake_skipped_unknown',
        summary: '已跳过这次补拍，本次诊断暂不能继续判断。',
        outcomeType: 'uncertain',
        visibleOutcomes: []
      }
    })
    const fixtureFor = opts => {
      const url = String(opts.url || '')
      const data = opts.data || {}
      // This must stay before the visual start branch: the no-image question-start
      // endpoint has its own fixed package contract and must never fall through to a
      // live local function during this deterministic replay.
      if (url.includes('diagnose-http/diagnosis/question/start')) {
        return pack(fullQuestionStartPackageResult())
      }
      if (url.includes('diagnose-http/diagnosis/start')) {
        return pack({
          diagnosisSessionId: 'e2e_pest_session',
          roundId: 'round_1',
          stage: 'intermediate',
          status: 'active',
          diagnosisProfile: data.diagnosisProfile || 'pest',
          routePrimaryAction: 'choose_direction',
          directionChoices: [
            {
              directionKey: 'pest',
              modeKey: 'pest',
              problemKey: 'pest',
              userDisplayName: '虫害：红蜘蛛、粉虱',
              recommended: true,
              associatedModeKeys: ['spider_mite', 'whitefly']
            }
          ],
          directMatches: [
            { modeKey: 'spider_mite', userDisplayName: '红蜘蛛' },
            { modeKey: 'whitefly', userDisplayName: '粉虱' }
          ],
          recommendedDirection: 'pest',
          recommendedMode: 'pest',
          answerRevision: 0
        })
      }
      if (url.includes('diagnose-http/diagnosis/answer')) {
        if (data.directionChoice || data.directionChoiceKey || data.selectedModeKey) {
          return pack(packageResult())
        }
        if (data.requestMode === 'answer_submit') {
          return pack(retakeRequestResult())
        }
        return null
      }
      if (url.includes('diagnose-http/diagnosis/retake/authorize')) {
        return pack(retakeAuthorization())
      }
      if (url.includes('diagnose-http/diagnosis/retake/skip')) {
        return pack(skippedRetakeResult())
      }
      if (
        String(opts.method || 'GET').toUpperCase() === 'GET' &&
        url.split('?')[0].endsWith('plant-user-http/user-plants')
      ) {
        return pack({
          list: [
            {
              id: 90001,
              plantId: 101,
              canonicalName: '端上验收植物',
              displayName: '端上验收植物',
              sourceType: 'catalog',
              wateringReminder: null
            }
          ],
          total: 1
        })
      }
      return null
    }
    const patch = original =>
      function request(opts = {}) {
        const captured = {
          url: String(opts.url || ''),
          method: String(opts.method || 'GET'),
          data: clone(opts.data),
          time: Date.now(),
          fixture: Boolean(globalThis.__e2eDiagnosisFixtureEnabled)
        }
        const fixtureResponse = globalThis.__e2eDiagnosisFixtureEnabled ? fixtureFor(opts) : null
        if (fixtureResponse) {
          captured.response = { statusCode: 200, data: fixtureResponse }
          globalThis.__e2eDiagnosisRequests.push(captured)
          appendStored('__plantsight_e2e_diagnosis_requests__', captured)
          setTimeout(() => {
            opts.success?.({ statusCode: 200, data: fixtureResponse })
            opts.complete?.({ statusCode: 200, data: fixtureResponse })
          }, 20)
          return { onChunkReceived() {}, abort() {} }
        }
        const origSuccess = opts.success
        const origFail = opts.fail
        opts.success = res => {
          captured.response = { statusCode: res?.statusCode, data: clone(res?.data) }
          globalThis.__e2eDiagnosisRequests.push(captured)
          appendStored('__plantsight_e2e_diagnosis_requests__', captured)
          return origSuccess?.(res)
        }
        opts.fail = error => {
          captured.error = String(error?.errMsg || error?.message || error)
          globalThis.__e2eDiagnosisRequests.push(captured)
          appendStored('__plantsight_e2e_diagnosis_requests__', captured)
          return origFail?.(error)
        }
        return original.call(this, opts)
      }
    if (uniRef && originalUniRequest) {
      uniRef.request = patch(originalUniRequest)
    }
    if (wxRef && originalWxRequest) {
      wxRef.request = patch(originalWxRequest)
    }
    const patchShowModal = () => opts => {
      globalThis.__e2eDiagnosisModals.push(clone(opts))
      appendStored('__plantsight_e2e_diagnosis_modals__', opts)
      setTimeout(() => {
        const response = { confirm: true, cancel: false }
        opts.success?.(response)
        opts.complete?.(response)
      }, 20)
      return Promise.resolve({ confirm: true, cancel: false })
    }
    if (uniRef && originalUniShowModal) {
      uniRef.showModal = patchShowModal()
    }
    if (wxRef && originalWxShowModal) {
      wxRef.showModal = patchShowModal()
    }
  })
}
