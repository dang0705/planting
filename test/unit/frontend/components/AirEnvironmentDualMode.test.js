// data_mode=unit_fake; test_kind=component_l3.
// 真实小程序页栈、wx.request 与持久化仍需 Automator live 验收。
import { h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import AirEnvironmentDualMode from '../../../../src/components/AirEnvironmentDualMode.vue'

const advancedStub = {
  props: ['modelValue'],
  emits: ['change'],
  setup(props, { emit }) {
    return () =>
      h('button', {
        id: 'advanced-stub-answer',
        onClick: () => emit('change', { ...props.modelValue, canopyOpenness: 'open' })
      })
  }
}

function mountDualMode(props = {}) {
  globalThis.uni = { showToast: vi.fn() }
  return mount(AirEnvironmentDualMode, {
    global: { stubs: { AirEnvironmentAssessment: advancedStub } },
    props: { idPrefix: 'dual-air', ...props }
  })
}

describe('AirEnvironmentDualMode completion boundary', () => {
  it('does not complete on tab or answer; completes only after Next is clicked', async () => {
    const wrapper = mountDualMode()

    await wrapper.get('#dual-air-tab-advanced').trigger('click')
    await wrapper.get('#dual-air-tab-quick').trigger('click')
    await wrapper.get('#dual-air-quick-option-regular').trigger('click')

    expect(wrapper.emitted('complete')).toBeUndefined()

    await wrapper.get('#dual-air-next').trigger('click')
    expect(wrapper.emitted('complete')).toEqual([
      [
        {
          schemaVersion: 3,
          mode: 'quick',
          quickAnswer: {
            questionKey: 'air_exchange_frequency',
            optionKey: 'regular'
          },
          advancedInput: null
        }
      ]
    ])
  })

  it('keeps independent drafts and blocks an unanswered quick mode', async () => {
    const wrapper = mountDualMode({ initialMode: 'advanced' })
    await wrapper.get('#advanced-stub-answer').trigger('click')
    await wrapper.get('#dual-air-tab-quick').trigger('click')
    await wrapper.get('#dual-air-next').trigger('click')

    expect(wrapper.emitted('complete')).toBeUndefined()
    expect(globalThis.uni.showToast).toHaveBeenCalledWith({
      title: '请选择植物所处空间的换气频率',
      icon: 'none'
    })

    await wrapper.get('#dual-air-quick-option-frequent').trigger('click')
    await wrapper.get('#dual-air-tab-advanced').trigger('click')
    await nextTick()
    expect(wrapper.find('#advanced-stub-answer').exists()).toBe(true)
  })

  it('uses the outer diagnosis footer without rendering a second Next button', () => {
    const wrapper = mountDualMode({ externalFooter: true })
    expect(wrapper.find('#dual-air-next').exists()).toBe(false)
    expect(wrapper.get('#dual-air-tab-quick').exists()).toBe(true)
  })
})
