// data_mode=unit_fake; test_kind=component_l2. 真实小程序交互仍需 Automator live 验收。
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import LightEnvironmentPicker from '../../../../src/components/LightEnvironmentPicker.vue'

const USER_DIRECT_GLASS = {
  captureSource: 'user',
  entryMethod: 'through_glass',
  hasSupplementalLight: false,
  naturalLightType: 'direct',
  schemaVersion: 2
}

function mountPicker(props = {}) {
  return mount(LightEnvironmentPicker, {
    props: { idPrefix: 'light-test', questionId: 'leaf', ...props }
  })
}

async function changeSupplementalLight(wrapper, value) {
  wrapper
    .get('#light-test-supplemental-light-leaf')
    .element.dispatchEvent(new CustomEvent('change', { detail: { value } }))
  await nextTick()
}

describe('LightEnvironmentPicker', () => {
  it('commits light type, entry method, supplemental light and confirmation as one user result', async () => {
    const wrapper = mountPicker({ requiresConfirmation: true })

    expect(wrapper.get('#light-test-environment-leaf').text()).toContain('直射光')
    expect(wrapper.find('#light-test-confirm-current-leaf').exists()).toBe(false)

    await wrapper.get('#light-test-type-direct-leaf').trigger('click')
    await wrapper.get('#light-test-entry-open_environment-leaf').trigger('click')
    await changeSupplementalLight(wrapper, true)

    expect(wrapper.get('#light-test-confirm-current-leaf').exists()).toBe(true)
    expect(wrapper.get('#light-test-environment-leaf').text()).toContain('已记录补光灯')

    await wrapper.get('#light-test-confirm-current-leaf').trigger('click')

    const confirmedPayload = wrapper
      .emitted('confirm')
      ?.flat()
      .find(event => event && typeof event === 'object')
    expect(confirmedPayload).toMatchObject({
      captureSource: 'user',
      entryMethod: 'open_environment',
      hasSupplementalLight: true,
      naturalLightType: 'direct',
      schemaVersion: 2
    })
  })

  it('disables entry methods for almost no natural light and restores the prior method when leaving it', async () => {
    const wrapper = mountPicker({
      modelValue: { ...USER_DIRECT_GLASS, entryMethod: 'open_environment' }
    })

    await wrapper.get('#light-test-type-almost_none-leaf').trigger('click')

    expect(wrapper.get('#light-test-entry-through_glass-leaf').classes()).toContain(
      'border-[#d1dbd4]'
    )
    expect(wrapper.get('#light-test-entry-open_environment-leaf').classes()).toContain(
      'text-[#8f9991]'
    )
    expect(
      wrapper
        .emitted('change')
        ?.flat()
        .findLast(event => event?.naturalLightType)
    ).toMatchObject({
      entryMethod: null,
      naturalLightType: 'almost_none'
    })

    await wrapper.get('#light-test-type-bright_diffuse-leaf').trigger('click')

    expect(wrapper.get('#light-test-entry-open_environment-leaf').classes()).toContain('border-2')
    expect(
      wrapper
        .emitted('change')
        ?.flat()
        .findLast(event => event?.naturalLightType)
    ).toMatchObject({
      entryMethod: 'open_environment',
      naturalLightType: 'bright_diffuse'
    })
  })

  it('does not commit any light change while disabled', async () => {
    const wrapper = mountPicker({ disabled: true, modelValue: { ...USER_DIRECT_GLASS } })

    expect(wrapper.get('#light-test-environment-leaf').classes()).toEqual(
      expect.arrayContaining(['pointer-events-none', 'opacity-60'])
    )

    await wrapper.get('#light-test-type-weak_diffuse-leaf').trigger('click')
    await changeSupplementalLight(wrapper, true)

    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.get('#light-test-environment-leaf').text()).not.toContain('已记录补光灯')
  })
})
