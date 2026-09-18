// data_mode=unit_fake; test_kind=component_l2. 真实小程序交互仍需 Automator live 验收。
import { h } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AirEnvironmentAssessment from '../../../../src/components/AirEnvironmentAssessment.vue'

const INITIAL_EXCHANGE = {
  source: 'window',
  windowDirectionCount: 'one',
  windowOpenFrequency: 'daily'
}
const EMPTY_DEVICE_AIRFLOW = {
  directSources: [],
  mode: null,
  sourceModes: {},
  sources: []
}
const NO_DEVICE_AIRFLOW = {
  directSources: [],
  mode: 'none',
  sourceModes: {},
  sources: []
}
const EXCHANGE_STUB_CHANGE = { ...INITIAL_EXCHANGE }

function createModel(overrides = {}) {
  return {
    airExchange: { ...INITIAL_EXCHANGE },
    canopyOpenness: null,
    deviceAirflow: { ...EMPTY_DEVICE_AIRFLOW },
    ...overrides
  }
}

const airExchangeStub = {
  emits: ['change'],
  props: ['idPrefix'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          id: `${props.idPrefix}-stub-change`,
          onClick: () => emit('change', { ...EXCHANGE_STUB_CHANGE })
        },
        '记录室内外换气'
      )
  }
}

const optionCardStub = {
  emits: ['select'],
  props: ['disabled', 'id', 'label'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          id: props.id,
          disabled: props.disabled,
          onClick: () => emit('select')
        },
        props.label
      )
  }
}

const deviceAirflowStub = {
  emits: ['change'],
  props: ['idPrefix'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          id: `${props.idPrefix}-stub-device-none`,
          onClick: () => emit('change', { ...NO_DEVICE_AIRFLOW })
        },
        '记录没有设备风'
      )
  }
}

const singlePageStub = {
  name: 'AirEnvironmentSinglePagePrototypeStub',
  props: ['hideNavigation', 'idPrefix'],
  setup(props) {
    return () =>
      h('view', {
        id: `${props.idPrefix}-single-page`,
        'data-hide-navigation': String(props.hideNavigation)
      })
  }
}

const scrollViewStub = {
  setup(_, { slots }) {
    return () => h('view', slots.default?.())
  }
}

function mountAssessment(props = {}) {
  return mount(AirEnvironmentAssessment, {
    global: {
      stubs: {
        AirEnvironmentOptionCard: optionCardStub,
        AirEnvironmentSinglePagePrototype: singlePageStub,
        AirExchangeAssessment: airExchangeStub,
        DeviceAirflowAssessment: deviceAirflowStub,
        'scroll-view': scrollViewStub
      }
    },
    props: {
      completionLabel: '保存环境记录',
      idPrefix: 'air-test',
      layoutMode: 'multi-step',
      ...props
    }
  })
}

describe('AirEnvironmentAssessment', () => {
  it('advances only through the exchange step and emits a complete environment after all answers exist', async () => {
    const wrapper = mountAssessment()

    expect(wrapper.get('#air-test-exchange-step').exists()).toBe(true)
    expect(wrapper.get('#air-test-next-step').element.disabled).toBe(false)

    await wrapper.get('#air-test-next-step').trigger('click')

    expect(wrapper.get('#air-test-local-airflow-step').exists()).toBe(true)
    expect(wrapper.find('#air-test-exchange-step').exists()).toBe(false)
    expect(wrapper.get('#air-test-complete').element.disabled).toBe(true)

    await wrapper.get('#air-test-canopy-open').trigger('click')
    await wrapper.get('#air-test-stub-device-none').trigger('click')

    expect(wrapper.get('#air-test-insight').text()).toContain('周围开阔')
    expect(wrapper.get('#air-test-complete').element.disabled).toBe(false)

    await wrapper.get('#air-test-complete').trigger('click')

    const completePayload = wrapper
      .emitted('complete')
      ?.flat()
      .find(event => event && typeof event === 'object')
    expect(completePayload).toMatchObject({
      airExchange: {
        source: 'window',
        windowDirectionCount: 'one',
        windowOpenFrequency: 'daily'
      },
      canopyOpenness: 'open',
      deviceAirflow: {
        directSources: [],
        mode: 'none',
        sourceModes: {},
        sources: []
      }
    })
  })

  it('keeps navigation and completion blocked when the assessment is disabled', async () => {
    const wrapper = mountAssessment({ disabled: true })

    expect(wrapper.get('#air-test-assessment').classes()).toEqual(
      expect.arrayContaining(['pointer-events-none', 'opacity-60'])
    )
    expect(wrapper.get('#air-test-next-step').element.disabled).toBe(true)

    await wrapper.get('#air-test-next-step').trigger('click')

    expect(wrapper.find('#air-test-local-airflow-step').exists()).toBe(false)
  })

  it('renders the single-page branch and resets to the first step after an external model change', async () => {
    const wrapper = mountAssessment({ layoutMode: 'single-page', externalFooter: true })

    expect(wrapper.get('#air-test-single-page').attributes('data-hide-navigation')).toBe('true')
    expect(wrapper.find('#air-test-swiper').exists()).toBe(false)

    await wrapper.setProps({ layoutMode: 'multi-step' })
    await wrapper.get('#air-test-next-step').trigger('click')
    expect(wrapper.get('#air-test-local-airflow-step').exists()).toBe(true)

    await wrapper.setProps({
      modelValue: createModel({
        canopyOpenness: 'partial',
        deviceAirflow: { ...NO_DEVICE_AIRFLOW }
      })
    })

    expect(wrapper.get('#air-test-exchange-step').exists()).toBe(true)
    expect(wrapper.find('#air-test-local-airflow-step').exists()).toBe(false)
  })
})
