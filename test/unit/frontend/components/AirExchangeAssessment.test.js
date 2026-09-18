// data_mode=unit_fake; test_kind=component_l2. 真实小程序交互仍需 Automator live 验收。
import { h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AirExchangeAssessment from '../../../../src/components/AirExchangeAssessment.vue'

const WINDOW_DEFAULTS = {
  source: 'window',
  windowDirectionCount: 'one',
  windowOpenFrequency: 'daily'
}

const airflowSceneStub = {
  props: ['scene', 'thumbnailAspectRatio'],
  setup(props) {
    return () =>
      h('view', {
        'data-airflow-scene': 'true',
        'data-scene': props.scene,
        'data-thumbnail-aspect-ratio': String(props.thumbnailAspectRatio)
      })
  }
}

function mountExchange(props = {}) {
  return mount(AirExchangeAssessment, {
    global: { stubs: { AirflowScene: airflowSceneStub } },
    props: { idPrefix: 'exchange-test', ...props }
  })
}

async function changeSwitch(wrapper, selector, value) {
  wrapper.get(selector).element.dispatchEvent(new CustomEvent('change', { detail: { value } }))
  await nextTick()
}

describe('AirExchangeAssessment', () => {
  it('restores window evidence after temporarily switching to fresh air', async () => {
    const wrapper = mountExchange()

    expect(wrapper.find('#exchange-test-window-details').exists()).toBe(false)

    await wrapper.get('#exchange-test-source-window').trigger('click')
    await wrapper.get('#exchange-test-window-direction-two-or-more').trigger('click')
    await wrapper.get('#exchange-test-window-frequency-almost-never').trigger('click')

    expect(wrapper.get('#exchange-test-fresh-air-switch-row').exists()).toBe(true)
    expect(wrapper.get('#exchange-test-window-direction-two-or-more').classes()).toContain(
      'border-[#b8c9be]'
    )
    expect(wrapper.get('#exchange-test-window-frequency-almost-never').classes()).toContain(
      'border-brand'
    )

    await changeSwitch(wrapper, '#exchange-test-fresh-air-switch', true)

    expect(wrapper.find('#exchange-test-window-details').exists()).toBe(false)
    expect(wrapper.get('#exchange-test-fresh-air-switch').attributes()).toHaveProperty('checked')
    expect(wrapper.get('#exchange-test-assessment').text()).toContain('主要靠新风')

    await changeSwitch(wrapper, '#exchange-test-fresh-air-switch', false)

    expect(wrapper.get('#exchange-test-window-details').exists()).toBe(true)
    expect(wrapper.get('#exchange-test-window-direction-two-or-more').classes()).toContain(
      'border-[#b8c9be]'
    )
    expect(wrapper.get('#exchange-test-window-frequency-almost-never').classes()).toContain(
      'border-brand'
    )

    const lastChange = wrapper
      .emitted('change')
      ?.flat()
      .findLast(event => event && event.source === 'window')
    expect(lastChange).toMatchObject({
      source: 'window',
      windowDirectionCount: 'two_or_more',
      windowOpenFrequency: 'almost_never'
    })
  })

  it('does not mutate answers through any option or switch while disabled', async () => {
    const wrapper = mountExchange({ disabled: true, modelValue: { ...WINDOW_DEFAULTS } })

    expect(wrapper.get('#exchange-test-assessment').classes()).toEqual(
      expect.arrayContaining(['pointer-events-none', 'opacity-60'])
    )
    expect(wrapper.get('#exchange-test-window-direction-one').attributes('aria-disabled')).toBe(
      'true'
    )
    expect(wrapper.find('#exchange-test-fresh-air-switch').exists()).toBe(false)

    await wrapper.get('#exchange-test-window-direction-two-or-more').trigger('click')
    await wrapper.get('#exchange-test-window-frequency-almost-never').trigger('click')

    expect(wrapper.emitted('change')).toBeUndefined()
  })
})
