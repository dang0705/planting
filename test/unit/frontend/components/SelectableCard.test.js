// data_mode=unit_fake; test_kind=component_l2. 真实小程序交互仍需 Automator live 验收。
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SelectableCard from '../../../../src/components/SelectableCard.vue'

describe('SelectableCard', () => {
  it('renders its slot and emits select when an enabled card is clicked', async () => {
    const wrapper = mount(SelectableCard, {
      props: { id: 'organ-leaf' },
      slots: { default: '叶片' }
    })

    const card = wrapper.get('#organ-leaf')

    expect(card.text()).toBe('叶片')

    await card.trigger('click')

    // oxlint-disable-next-line no-magic-numbers -- the component contract emits exactly one event per click
    expect(wrapper.emitted('select')).toHaveLength(1)
  })

  it('does not emit select when the card is disabled', async () => {
    const wrapper = mount(SelectableCard, {
      props: { disabled: true, id: 'organ-root' },
      slots: { default: '根部' }
    })

    const card = wrapper.get('#organ-root')

    expect(card.classes()).toContain('pointer-events-none')

    await card.trigger('click')

    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('renders the selected visual state from the selected prop', () => {
    const wrapper = mount(SelectableCard, {
      props: { id: 'organ-stem', selected: true },
      slots: { default: '茎部' }
    })

    const card = wrapper.get('#organ-stem')

    expect(card.classes()).toContain('border-brand')
    expect(card.classes()).toContain('bg-[#e8f5e9]')
  })
})
