// data_mode=unit_fake; test_kind=component_l2. 真实小程序交互仍需 Automator live 验收。
import { h } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AirEnvironmentOptionCard from '../../../../src/components/AirEnvironmentOptionCard.vue'

const airflowSceneStub = {
  props: ['motionProfile', 'scene', 'thumbnailAspectRatio'],
  setup(props) {
    return () =>
      h('view', {
        'data-airflow-scene': 'true',
        'data-motion-profile': props.motionProfile,
        'data-scene': props.scene,
        'data-thumbnail-aspect-ratio': String(props.thumbnailAspectRatio)
      })
  }
}

function mountCard(props = {}) {
  return mount(AirEnvironmentOptionCard, {
    global: { stubs: { AirflowScene: airflowSceneStub } },
    props: {
      description: '保持空气流通',
      id: 'airflow-open',
      label: '经常开窗',
      ...props
    }
  })
}

describe('AirEnvironmentOptionCard', () => {
  it('renders the option, scene contract, selection state and select event', async () => {
    const wrapper = mountCard({
      motionProfile: 'gentle',
      scene: 'open',
      selected: true
    })

    expect(wrapper.get('#airflow-open').text()).toContain('经常开窗')
    expect(wrapper.get('#airflow-open').text()).toContain('保持空气流通')
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['border-brand', 'bg-[#e8f5e9]']))

    const scene = wrapper.get('[data-airflow-scene]')
    expect(scene.attributes('data-scene')).toBe('open')
    expect(scene.attributes('data-motion-profile')).toBe('gentle')
    // oxlint-disable-next-line no-magic-numbers -- the component uses the fixed 88x61 thumbnail ratio
    expect(scene.attributes('data-thumbnail-aspect-ratio')).toBe(String(88 / 61))

    await wrapper.get('#airflow-open').trigger('click')

    // oxlint-disable-next-line no-magic-numbers -- the card contract emits exactly one event per click
    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.get('[aria-hidden="true"]').text()).toContain('✓')
  })

  it('blocks selection while disabled and keeps the disabled visual state', async () => {
    const wrapper = mountCard({ disabled: true, id: 'airflow-disabled' })

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['pointer-events-none', 'opacity-50']))

    await wrapper.get('#airflow-disabled').trigger('click')

    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('renders unknown options without a scene or description', () => {
    const wrapper = mountCard({
      description: '不应在未知选项中显示',
      id: 'airflow-unknown',
      isUnknown: true,
      showSelectionIndicator: false
    })

    expect(wrapper.get('#airflow-unknown').text()).toContain('?')
    expect(wrapper.get('#airflow-unknown').text()).toContain('经常开窗')
    expect(wrapper.get('#airflow-unknown').text()).not.toContain('不应在未知选项中显示')
    expect(wrapper.find('[data-airflow-scene]').exists()).toBe(false)
    expect(wrapper.find('[aria-hidden="true"]').exists()).toBe(false)
  })

  it('uses the vertical layout and two-line description policy', () => {
    const wrapper = mountCard({
      compact: true,
      descriptionLines: 2,
      id: 'airflow-vertical',
      orientation: 'vertical'
    })

    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['flex-col', 'overflow-hidden', 'rounded-2xl', 'p-0'])
    )
    expect(wrapper.findAll('view').some(node => node.classes().includes('aspect-[2/1]'))).toBe(true)
    expect(wrapper.find('.line-clamp-2').exists()).toBe(true)
    expect(wrapper.get('[data-airflow-scene]').attributes('data-thumbnail-aspect-ratio')).toBe('2')
  })
})
