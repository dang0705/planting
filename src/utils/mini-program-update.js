import { reactive } from 'vue'

export const MINI_PROGRAM_UPDATE_PHASES = Object.freeze({
  IDLE: 'idle',
  CHECKING: 'checking',
  DOWNLOADING: 'downloading',
  APPLYING: 'applying',
  FAILED: 'failed',
  UNSUPPORTED: 'unsupported'
})

const INITIAL_STATE = {
  phase: MINI_PROGRAM_UPDATE_PHASES.IDLE,
  hasUpdate: false,
  retryable: false
}

export const miniProgramUpdateState = reactive({ ...INITIAL_STATE })

let appController = null

function getDefaultUpdateManager() {
  // #ifdef MP-WEIXIN
  if (typeof wx !== 'undefined' && typeof wx.getUpdateManager === 'function') {
    return wx.getUpdateManager()
  }
  // #endif
  return null
}

export function createMiniProgramUpdateController({
  getUpdateManager = getDefaultUpdateManager,
  onStateChange = () => {}
} = {}) {
  let currentState = { ...INITIAL_STATE }
  let started = false
  let generation = 0

  function publish(nextState) {
    currentState = { ...nextState }
    onStateChange({ ...currentState })
  }

  function start({ retainUpdateState = false } = {}) {
    if (started) {
      return false
    }

    started = true
    const currentGeneration = ++generation
    let updateManager = null

    try {
      updateManager = getUpdateManager()
    } catch {
      updateManager = null
    }

    const requiredMethods = ['onCheckForUpdate', 'onUpdateReady', 'onUpdateFailed', 'applyUpdate']
    const hasRequiredMethods =
      updateManager && requiredMethods.every(method => typeof updateManager[method] === 'function')

    if (!hasRequiredMethods) {
      publish({ ...INITIAL_STATE, phase: MINI_PROGRAM_UPDATE_PHASES.UNSUPPORTED })
      return false
    }

    publish({
      ...INITIAL_STATE,
      phase: MINI_PROGRAM_UPDATE_PHASES.CHECKING,
      hasUpdate: retainUpdateState
    })
    const isCurrentManager = () => currentGeneration === generation

    try {
      updateManager.onCheckForUpdate(result => {
        if (!isCurrentManager() || currentState.phase === MINI_PROGRAM_UPDATE_PHASES.APPLYING) {
          return
        }
        const hasUpdate = result?.hasUpdate === true
        publish({
          phase: hasUpdate
            ? MINI_PROGRAM_UPDATE_PHASES.DOWNLOADING
            : MINI_PROGRAM_UPDATE_PHASES.IDLE,
          hasUpdate,
          retryable: false
        })
      })

      updateManager.onUpdateReady(() => {
        if (!isCurrentManager() || currentState.phase === MINI_PROGRAM_UPDATE_PHASES.APPLYING) {
          return
        }
        publish({
          phase: MINI_PROGRAM_UPDATE_PHASES.APPLYING,
          hasUpdate: true,
          retryable: false
        })
        try {
          updateManager.applyUpdate()
        } catch {
          publish({
            phase: MINI_PROGRAM_UPDATE_PHASES.FAILED,
            hasUpdate: true,
            retryable: true
          })
        }
      })

      updateManager.onUpdateFailed(() => {
        if (!isCurrentManager()) {
          return
        }
        publish({
          phase: MINI_PROGRAM_UPDATE_PHASES.FAILED,
          hasUpdate: true,
          retryable: true
        })
      })
    } catch {
      publish({ ...INITIAL_STATE, phase: MINI_PROGRAM_UPDATE_PHASES.UNSUPPORTED })
      return false
    }

    return true
  }

  function retry() {
    if (!currentState.retryable) {
      return false
    }
    started = false
    return start({ retainUpdateState: true })
  }

  return { start, retry }
}

export function startMiniProgramUpdateCheck() {
  if (!appController) {
    appController = createMiniProgramUpdateController({
      onStateChange: nextState => Object.assign(miniProgramUpdateState, nextState)
    })
  }
  return appController.start()
}

export function retryMiniProgramUpdate() {
  return appController?.retry() || false
}
