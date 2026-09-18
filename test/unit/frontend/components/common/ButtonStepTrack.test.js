// data_mode=unit_fake; test_kind=component_l2. 真实小程序交互仍需 Automator live 验收。
import { h } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import ButtonStepTrack from '../../../../../src/components/common/ButtonStepTrack.vue'

function renderStep({ index, active, item }) {
  return h(
    'text',
    { 'data-step-index': String(index) },
    `${item?.label || 'empty'}:${active ? 'active' : 'inactive'}`
  )
}

function renderFooter({ index, item }) {
  return h('text', { 'data-footer-index': String(index) }, item?.label || 'empty')
}

describe('ButtonStepTrack', () => {
  it('emits a step-change event after switching steps so the real scroll owner can reset', async () => {
    const wrapper = mount(ButtonStepTrack, {
      props: {
        activeIndex: 0,
        items: [{ label: '第一步' }, { label: '第二步' }]
      },
      slots: { footer: renderFooter, step: renderStep }
    })

    await wrapper.setProps({ activeIndex: 1 })

    expect(wrapper.emitted('step-change')).toEqual([[1]])

    wrapper.unmount()
  })

  it('renders every step and exposes active state to both slots', () => {
    const stepItems = [{ label: '频率' }, { label: '剂量' }, { label: '确认' }]
    const wrapper = mount(ButtonStepTrack, {
      props: {
        activeIndex: 1,
        fill: false,
        id: 'watering-steps',
        itemClass: 'step-item',
        items: stepItems,
        rootClass: 'step-root',
        viewportClass: 'step-viewport',
        viewportStyle: { minHeight: '20px' }
      },
      slots: {
        footer: renderFooter,
        step: renderStep
      }
    })

    expect(wrapper.attributes('id')).toBe('watering-steps')
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['flex-none', 'step-root', 'overflow-hidden'])
    )
    expect(wrapper.find('.step-viewport').attributes('style')).toContain('min-height: 20px')

    const steps = wrapper.findAll('.basis-full')
    expect(steps).toHaveLength(stepItems.length)
    expect(steps.map(step => step.text())).toEqual([
      '频率:inactive',
      '剂量:active',
      '确认:inactive'
    ])
    expect(steps.find(step => step.text().startsWith('剂量:')).classes()).toContain('step-item')
    expect(wrapper.find('.transition-transform').attributes('style')).toContain(
      'transform: translateX(-100%)'
    )
    expect(wrapper.find('[data-footer-index="1"]').text()).toBe('剂量')
  })

  it('uses items as the source of step count and skips empty step slot content', () => {
    const items = [{ label: '叶片' }, null, { label: '根部' }]
    const stepSlot = vi.fn(renderStep)
    const wrapper = mount(ButtonStepTrack, {
      props: {
        activeIndex: 99,
        items,
        stepCount: 10
      },
      slots: {
        footer: renderFooter,
        step: stepSlot
      }
    })

    expect(wrapper.findAll('.basis-full')).toHaveLength(items.length)
    expect(stepSlot).toHaveBeenCalledTimes(items.filter(Boolean).length)
    expect(wrapper.findAll('[data-step-index]')).toHaveLength(items.filter(Boolean).length)
    expect(wrapper.find('[data-step-index="0"]').text()).toBe('叶片:inactive')
    expect(wrapper.find('[data-step-index="2"]').text()).toBe('根部:active')
    expect(wrapper.find('.transition-transform').attributes('style')).toContain(
      'transform: translateX(-200%)'
    )
    expect(wrapper.find('[data-footer-index="2"]').text()).toBe('根部')
  })

  it('clamps negative active indexes to the first step and updates reactively', async () => {
    const wrapper = mount(ButtonStepTrack, {
      props: {
        activeIndex: -4,
        items: [{ label: '第一步' }, { label: '第二步' }]
      },
      slots: { footer: renderFooter, step: renderStep }
    })

    expect(wrapper.find('.transition-transform').attributes('style')).toContain(
      'transform: translateX(-0%)'
    )
    expect(wrapper.find('[data-footer-index="0"]').text()).toBe('第一步')

    await wrapper.setProps({ activeIndex: 1 })

    expect(wrapper.find('.transition-transform').attributes('style')).toContain(
      'transform: translateX(-100%)'
    )
    expect(wrapper.find('[data-footer-index="1"]').text()).toBe('第二步')
  })

  it('keeps the fixed footer visible outside the clipped track viewport', () => {
    const wrapper = mount(ButtonStepTrack, {
      props: { footerPosition: 'fixed', stepCount: 1 }
    })

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['flex-1', 'overflow-visible']))
    expect(wrapper.find('.fixed.bottom-0').exists()).toBe(true)
  })
})
