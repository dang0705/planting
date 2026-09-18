// data_mode=unit_fake; test_kind=component_l3.
// 真实小程序页栈、编译产物、登录态和 wx.request 仍需 Automator live 验收。
import { h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AirEnvironmentAssessment from '../../../../src/components/AirEnvironmentAssessment.vue'

const frequencyIndex = {
  almostNever: 3,
  everyOtherDay: 1
}

const airflowSceneStub = {
  props: ['motionProfile', 'scene', 'thumbnailAspectRatio'],
  setup(props) {
    return () =>
      h('view', {
        'data-airflow-scene': 'true',
        'data-motion-profile': props.motionProfile || '',
        'data-scene': props.scene || '',
        'data-thumbnail-aspect-ratio': String(props.thumbnailAspectRatio || '')
      })
  }
}

const deviceAirflowSceneStub = {
  props: ['sources'],
  setup(props) {
    return () =>
      h('view', {
        'data-device-airflow-scene': 'true',
        'data-sources': JSON.stringify(props.sources || [])
      })
  }
}

function mountAssessment(props = {}) {
  return mount(AirEnvironmentAssessment, {
    global: {
      stubs: {
        AirflowScene: airflowSceneStub,
        DeviceAirflowScene: deviceAirflowSceneStub
      }
    },
    props: {
      completionLabel: '保存环境记录',
      idPrefix: 'air-l3',
      layoutMode: 'single-page',
      ...props
    }
  })
}

async function changePicker(wrapper, selector, value) {
  wrapper.get(selector).element.dispatchEvent(new CustomEvent('change', { detail: { value } }))
  await nextTick()
}

async function changeSwitch(wrapper, selector, value) {
  wrapper.get(selector).element.dispatchEvent(new CustomEvent('change', { detail: { value } }))
  await nextTick()
}

describe('AirEnvironmentAssessment component integration', () => {
  it('coordinates the real single-page modules into one completion payload', async () => {
    const wrapper = mountAssessment()

    await wrapper.get('#air-l3-single-window-direction-two_or_more').trigger('click')
    await changePicker(
      wrapper,
      '#air-l3-single-window-frequency-picker',
      frequencyIndex.everyOtherDay
    )
    await wrapper.get('#air-l3-single-canopy-open').trigger('click')
    await wrapper.get('#air-l3-single-device-mode-has_airflow').trigger('click')
    await wrapper.get('#air-l3-single-device-source-fan-direct').trigger('click')

    expect(wrapper.get('#air-l3-single-device-source-fan-direct').attributes('aria-checked')).toBe(
      'true'
    )
    expect(wrapper.get('#air-l3-single-summary').text()).toContain(
      '主要靠开窗 · 无遮挡 · 风扇直吹、空调不直吹'
    )
    expect(wrapper.get('#air-l3-complete').element.disabled).toBe(false)

    await wrapper.get('#air-l3-complete').trigger('click')

    expect(wrapper.emitted('complete')).toEqual([
      [
        {
          airExchange: {
            source: 'window',
            windowDirectionCount: 'two_or_more',
            windowOpenFrequency: 'every_other_day'
          },
          canopyOpenness: 'open',
          deviceAirflow: {
            mode: 'direct',
            sources: ['fan', 'air_conditioner'],
            directSources: ['fan'],
            sourceModes: {
              fan: 'direct',
              air_conditioner: 'circulating'
            }
          }
        }
      ]
    ])
  })

  it('reconciles fresh-air selection with device evidence and removes the synthetic source on return', async () => {
    const wrapper = mountAssessment()

    await wrapper.get('#air-l3-single-window-direction-two_or_more').trigger('click')
    await changePicker(
      wrapper,
      '#air-l3-single-window-frequency-picker',
      frequencyIndex.almostNever
    )
    await changeSwitch(wrapper, '#air-l3-single-fresh-air-switch', true)

    expect(wrapper.get('#air-l3-single-exchange').text()).toContain('主要靠新风')
    expect(
      wrapper.get('#air-l3-single-device-source-fresh_air-circulating').attributes('aria-checked')
    ).toBe('true')

    await changeSwitch(wrapper, '#air-l3-single-fresh-air-switch', false)

    expect(wrapper.get('#air-l3-single-exchange').text()).toContain('几乎不开（可选新风系统）')
    expect(wrapper.find('#air-l3-single-device-source-fresh_air').exists()).toBe(false)
    expect(wrapper.get('#air-l3-complete').element.disabled).toBe(true)

    await wrapper.get('#air-l3-single-canopy-partial').trigger('click')
    await wrapper.get('#air-l3-single-device-mode-none').trigger('click')
    expect(wrapper.get('#air-l3-complete').element.disabled).toBe(false)

    await wrapper.get('#air-l3-complete').trigger('click')

    expect(wrapper.emitted('complete')).toEqual([
      [
        {
          airExchange: {
            source: 'window',
            windowDirectionCount: 'two_or_more',
            windowOpenFrequency: 'almost_never'
          },
          canopyOpenness: 'partial',
          deviceAirflow: {
            mode: 'none',
            sources: [],
            directSources: [],
            sourceModes: {}
          }
        }
      ]
    ])
  })

  it('keeps completion blocked when the real single-page device module has no selected source', async () => {
    const wrapper = mountAssessment()

    await wrapper.get('#air-l3-single-canopy-open').trigger('click')
    await wrapper.get('#air-l3-single-device-mode-has_airflow').trigger('click')
    await wrapper.get('#air-l3-single-device-source-fan-toggle').trigger('click')
    await wrapper.get('#air-l3-single-device-source-air_conditioner-toggle').trigger('click')

    expect(wrapper.get('#air-l3-single-device-sources').text()).toContain(
      '都不到植物？请选择“没有设备风”'
    )
    expect(wrapper.get('#air-l3-complete').element.disabled).toBe(true)
    expect(wrapper.emitted('complete')).toBeUndefined()
  })
})
