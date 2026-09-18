// data_mode=unit_fake; test_kind=component_l2.
// Expected 来源：用户需求“强制自动更新”的不可跳过更新界面与失败恢复要求。
// 该测试验证组件的用户可见结果，不证明真实 WXML 或微信版本更新能力。
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MiniProgramUpdateGate from '../../../../src/components/MiniProgramUpdateGate.vue'

const ONE_EMITTED_EVENT = 1

describe('MiniProgramUpdateGate', () => {
  it('does not render while the app has no update to apply', () => {
    const wrapper = mount(MiniProgramUpdateGate, { props: { phase: 'idle' } })

    expect(wrapper.find('#mini-program-update-gate').exists()).toBe(false)
  })

  it('blocks the app while the new package is being applied', () => {
    const wrapper = mount(MiniProgramUpdateGate, { props: { phase: 'applying' } })

    expect(wrapper.get('#mini-program-update-gate').text()).toContain('正在重启应用')
    expect(wrapper.find('#mini-program-update-retry-button').exists()).toBe(false)
  })

  it('keeps the app blocked while retrying a known update', () => {
    const wrapper = mount(MiniProgramUpdateGate, {
      props: { hasUpdate: true, phase: 'checking' }
    })

    expect(wrapper.get('#mini-program-update-gate').text()).toContain('正在重新检查更新')
  })

  it('shows a user-readable retry action after an update download fails', async () => {
    const wrapper = mount(MiniProgramUpdateGate, { props: { phase: 'failed' } })

    expect(wrapper.get('#mini-program-update-gate').text()).toContain('更新失败，请检查网络后重试')

    await wrapper.get('#mini-program-update-retry-button').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(ONE_EMITTED_EVENT)
  })
})
