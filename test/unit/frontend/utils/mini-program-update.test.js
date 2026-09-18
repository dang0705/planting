// data_mode=unit_fake; test_kind=component_l2.
// Expected 来源：用户需求“强制自动更新”与微信 UpdateManager 公共 API 合同。
// 该测试隔离微信更新管理器边界；真实微信运行时与正式发布版本仍需 Automator/live 验收。
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMiniProgramUpdateController } from '../../../../src/utils/mini-program-update.js'

const LAST_STATE_INDEX = -1
const FIRST_APPLY_CALL = 1
const SECOND_MANAGER_CALL = 2

function createUpdateManager() {
  const callbacks = {}
  return {
    applyUpdate: vi.fn(),
    onCheckForUpdate: vi.fn(callback => {
      callbacks.check = callback
    }),
    onUpdateFailed: vi.fn(callback => {
      callbacks.failed = callback
    }),
    onUpdateReady: vi.fn(callback => {
      callbacks.ready = callback
    }),
    emitCheck: result => callbacks.check(result),
    emitFailed: () => callbacks.failed(),
    emitReady: () => callbacks.ready()
  }
}

describe('mini-program update controller', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('does not block the app when the cold-start check finds no update', () => {
    const updateManager = createUpdateManager()
    const states = []
    const controller = createMiniProgramUpdateController({
      getUpdateManager: () => updateManager,
      onStateChange: state => states.push({ ...state })
    })

    controller.start()
    updateManager.emitCheck({ hasUpdate: false })

    expect(states.at(LAST_STATE_INDEX)).toEqual({
      phase: 'idle',
      hasUpdate: false,
      retryable: false
    })
    expect(updateManager.applyUpdate).not.toHaveBeenCalled()
  })

  it('automatically applies a downloaded update and only applies it once', () => {
    const updateManager = createUpdateManager()
    const states = []
    const controller = createMiniProgramUpdateController({
      getUpdateManager: () => updateManager,
      onStateChange: state => states.push({ ...state })
    })

    controller.start()
    updateManager.emitCheck({ hasUpdate: true })
    expect(states.at(LAST_STATE_INDEX)).toEqual({
      phase: 'downloading',
      hasUpdate: true,
      retryable: false
    })

    updateManager.emitReady()
    updateManager.emitReady()

    expect(states.at(LAST_STATE_INDEX)).toEqual({
      phase: 'applying',
      hasUpdate: true,
      retryable: false
    })
    expect(updateManager.applyUpdate).toHaveBeenCalledTimes(FIRST_APPLY_CALL)
  })

  it('keeps the app blocked after download failure and retries with a fresh manager', () => {
    const firstManager = createUpdateManager()
    const secondManager = createUpdateManager()
    const managers = [firstManager, secondManager]
    const states = []
    const getUpdateManager = vi.fn(() => managers.shift())
    const controller = createMiniProgramUpdateController({
      getUpdateManager,
      onStateChange: state => states.push({ ...state })
    })

    controller.start()
    firstManager.emitFailed()

    expect(states.at(LAST_STATE_INDEX)).toEqual({
      phase: 'failed',
      hasUpdate: true,
      retryable: true
    })

    controller.retry()
    expect(getUpdateManager).toHaveBeenCalledTimes(SECOND_MANAGER_CALL)
    expect(states.at(LAST_STATE_INDEX)).toEqual({
      phase: 'checking',
      hasUpdate: true,
      retryable: false
    })

    secondManager.emitReady()

    expect(secondManager.applyUpdate).toHaveBeenCalledTimes(FIRST_APPLY_CALL)
    expect(states.at(LAST_STATE_INDEX)).toEqual({
      phase: 'applying',
      hasUpdate: true,
      retryable: false
    })
  })

  it('stays non-blocking when the update API is unavailable', () => {
    const states = []
    const controller = createMiniProgramUpdateController({
      getUpdateManager: () => null,
      onStateChange: state => states.push({ ...state })
    })

    controller.start()

    expect(states.at(LAST_STATE_INDEX)).toEqual({
      phase: 'unsupported',
      hasUpdate: false,
      retryable: false
    })
  })
})
