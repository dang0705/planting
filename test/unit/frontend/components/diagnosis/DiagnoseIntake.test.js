// data_mode=unit_fake; test_kind=component_l2. 真实小程序交互仍需 Automator live 验收。
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DiagnoseIntake from '../../../../../src/components/diagnosis/DiagnoseIntake.vue'

function createView(overrides = {}) {
  return {
    SYMPTOM_CLASS_QUICK_SELECT_OPTIONS: [
      { classKey: 'yellowing_mode', symptomCn: '叶子发黄' },
      { classKey: 'wilting_droop_mode', symptomCn: '发蔫或下垂' }
    ],
    clearDevSymptomClass: vi.fn(),
    chooseImage: vi.fn(),
    handleSymptomClassQuickSelect: vi.fn(),
    imageFiles: [],
    isVisualScanning: false,
    primarySlotGroups: [],
    removeImage: vi.fn(),
    resetImages: vi.fn(),
    selectedDevSymptomClassKey: '',
    selectedDevSymptomClassOption: null,
    visualScanText: '正在检查照片...',
    ...overrides
  }
}

function mountIntake({ mode = 'default', soilImage = null, view = createView() } = {}) {
  return mount(DiagnoseIntake, {
    props: { mode, soilImage, view }
  })
}

describe('DiagnoseIntake', () => {
  beforeEach(() => {
    vi.stubGlobal('uni', {
      previewImage: vi.fn(),
      showToast: vi.fn()
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the default intake and routes supported selections to the view actions', async () => {
    const view = createView()
    const wrapper = mountIntake({ view })

    expect(wrapper.get('#diagnose-upload-stage').exists()).toBe(true)
    expect(wrapper.get('#diagnose-symptom-section').text()).toContain('常见明显症状')
    expect(wrapper.get('#diagnose-upload-section').text()).toContain('AI诊断')
    expect(wrapper.findAll('.diagnose-quick-option')).toHaveLength(
      view.SYMPTOM_CLASS_QUICK_SELECT_OPTIONS.length
    )

    await wrapper.get('#diagnose-dev-symptom-class-option-yellowing_mode').trigger('click')
    const yellowingOption = view.SYMPTOM_CLASS_QUICK_SELECT_OPTIONS.find(
      option => option.classKey === 'yellowing_mode'
    )
    expect(view.handleSymptomClassQuickSelect).toHaveBeenCalledWith(yellowingOption)

    await wrapper.get('#diagnose-upload-leaf-button').trigger('click')
    expect(view.chooseImage).toHaveBeenCalledWith('leaf')
  })

  it('shows the user-facing recovery toast when a symptom is not supported without photos', async () => {
    const view = createView({ SYMPTOM_CLASS_QUICK_SELECT_OPTIONS: [] })
    const wrapper = mountIntake({ view })

    await wrapper.get('#diagnose-dev-symptom-class-option-yellowing_mode').trigger('click')

    expect(globalThis.uni.showToast).toHaveBeenCalledWith({
      icon: 'none',
      title: '该症状请上传照片后进行综合诊断'
    })
    expect(view.handleSymptomClassQuickSelect).not.toHaveBeenCalled()
  })

  it('disables symptom entry when images exist and handles preview plus removal of the slot image', async () => {
    const imageFiles = [
      { previewUrl: 'https://example.test/leaf.jpg' },
      { previewUrl: 'https://example.test/whole-plant.jpg' }
    ]
    const leafImage = imageFiles.find(image => image.previewUrl.endsWith('/leaf.jpg'))
    const leafImageIndex = imageFiles.indexOf(leafImage)
    const view = createView({
      imageFiles,
      primarySlotGroups: [
        {
          items: [{ index: leafImageIndex, item: leafImage }],
          slotType: 'leaf'
        }
      ]
    })
    const wrapper = mountIntake({ view })

    expect(view.clearDevSymptomClass).toHaveBeenCalledOnce()
    expect(wrapper.get('#diagnose-symptom-section').classes()).toContain(
      'diagnose-section-card--disabled'
    )
    expect(wrapper.get('#diagnose-no-image-entry-panel').classes()).toContain(
      'diagnose-section-content--disabled'
    )
    expect(wrapper.get('#diagnose-upload-leaf-button').text()).toContain('叶片')
    expect(wrapper.get('#diagnose-upload-leaf-button').classes()).toContain(
      'diagnose-organ-slot--uploaded'
    )

    await wrapper.get('#diagnose-upload-leaf-button').trigger('click')
    expect(globalThis.uni.previewImage).toHaveBeenCalledWith({
      current: leafImage.previewUrl,
      urls: imageFiles.map(image => image.previewUrl)
    })

    await wrapper.get(`#diagnose-remove-image-${leafImageIndex}-button`).trigger('click')
    expect(view.removeImage).toHaveBeenCalledWith(leafImageIndex)
  })

  it('uses the selected symptom state to disable AI upload and exposes a clear action', async () => {
    const view = createView({
      selectedDevSymptomClassKey: 'yellowing_mode',
      selectedDevSymptomClassOption: { symptomCn: '叶子发黄' }
    })
    const wrapper = mountIntake({ view })

    expect(wrapper.get('#diagnose-upload-section').classes()).toContain(
      'diagnose-section-card--disabled'
    )
    expect(wrapper.get('#diagnose-upload-content').classes()).toContain(
      'diagnose-section-content--disabled'
    )
    expect(wrapper.get('#diagnose-dev-symptom-class-status').text()).toContain('叶子发黄')
    expect(view.resetImages).not.toHaveBeenCalled()

    await wrapper.get('#diagnose-dev-symptom-class-clear-button').trigger('click')
    expect(view.clearDevSymptomClass).toHaveBeenCalledOnce()
  })

  it('shows streamed scan text and blocks both upload and symptom selection while scanning', async () => {
    const view = createView({
      isVisualScanning: true,
      visualScanText: '正在识别叶片纹理'
    })
    const wrapper = mountIntake({ view })

    expect(wrapper.get('#diagnose-upload-content').text()).toContain('正在识别叶片纹理')
    expect(wrapper.get('#diagnose-visual-scan-line').exists()).toBe(true)
    expect(wrapper.find('#diagnose-upload-leaf-button').exists()).toBe(false)

    await wrapper.get('#diagnose-dev-symptom-class-option-yellowing_mode').trigger('click')
    expect(view.handleSymptomClassQuickSelect).not.toHaveBeenCalled()
  })

  it('renders the soil-only flow and emits the three soil actions at their user entry points', async () => {
    const wrapper = mountIntake({ mode: 'soil-only' })

    expect(wrapper.get('#watering-soil-intake').text()).toContain('点击盆土区域上传照片')
    expect(wrapper.get('#watering-soil-intake').text()).toContain('请俯拍盆土表面')
    expect(wrapper.find('#diagnose-intake-sections').exists()).toBe(false)

    await wrapper.get('#watering-soil-upload-zone').trigger('click')

    expect(wrapper.emitted('soil-select')).toEqual([[]])

    await wrapper.setProps({
      soilImage: { previewUrl: 'https://example.test/soil.jpg', sourceLabel: '相册' }
    })
    expect(wrapper.get('#watering-soil-intake').text()).toContain('相册')
    expect(wrapper.get('#watering-soil-intake').text()).not.toContain('点击盆土区域上传照片')

    await wrapper.get('#watering-soil-replace-button').trigger('click')
    await wrapper.get('#watering-soil-remove-button').trigger('click')
    await wrapper.get('#watering-soil-upload-zone').trigger('click')

    expect(wrapper.emitted('soil-replace')).toEqual([[]])
    expect(wrapper.emitted('soil-remove')).toEqual([[]])
    expect(globalThis.uni.previewImage).toHaveBeenCalledWith({
      current: 'https://example.test/soil.jpg',
      urls: ['https://example.test/soil.jpg']
    })
  })

  it('keeps the soil photo visible beneath the scan overlay', () => {
    const wrapper = mountIntake({
      mode: 'soil-only',
      soilImage: { previewUrl: 'https://example.test/soil.jpg' },
      view: createView({ isVisualScanning: true })
    })

    expect(wrapper.get('.watering-soil-upload-preview').attributes('src')).toBe(
      'https://example.test/soil.jpg'
    )
    expect(wrapper.get('#watering-soil-scan-overlay').exists()).toBe(true)
    expect(wrapper.get('#diagnose-visual-scan-line').exists()).toBe(true)
    expect(wrapper.find('#watering-soil-upload-loading').exists()).toBe(false)
    expect(wrapper.find('.watering-soil-upload-label').exists()).toBe(false)
  })
})
