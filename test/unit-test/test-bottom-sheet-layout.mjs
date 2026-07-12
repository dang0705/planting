import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const bottomSheetSource = readFileSync('src/components/common/BottomSheet.vue', 'utf8')
const wateringReminderSource = readFileSync(
  'src/pages/index/components/WateringReminderSheet.vue',
  'utf8'
)
const potProfileEditorSource = readFileSync(
  'src/pages/index/components/PotProfileEditor.vue',
  'utf8'
)
const diagnosePopupSource = readFileSync('src/components/DiagnosePopup.vue', 'utf8')

assert.match(
  bottomSheetSource,
  /class="bottom-sheet-panel flex flex-col overflow-hidden rounded-t-\[20px\] bg-white"/
)
assert.match(bottomSheetSource, /:style="panelStyle"/)
assert.match(bottomSheetSource, /const HEIGHT_MODE_AUTO = 'auto'/)
assert.match(bottomSheetSource, /const HEIGHT_MODE_FULL_HEIGHT = 'fullHeight'/)
assert.match(bottomSheetSource, /default: 'auto'/)
assert.match(bottomSheetSource, /validator: value => \['auto', 'fullHeight'\]\.includes\(value\)/)
assert.match(bottomSheetSource, /<scroll-view\s+v-if="isFullHeightMode"/)
assert.match(bottomSheetSource, /class="bottom-sheet-scroll-view min-h-0 flex-1 px-4"/)
assert.match(bottomSheetSource, /<view\s+v-else\s+:id="contentId"/)
assert.match(bottomSheetSource, /class="bottom-sheet-content min-h-0 px-4"/)
assert.doesNotMatch(bottomSheetSource, /--bottom-sheet-max-height/)
assert.doesNotMatch(bottomSheetSource, /max-h-\[var/)
assert.doesNotMatch(bottomSheetSource, /const scrollHeight = computed/)
assert.doesNotMatch(bottomSheetSource, /fixedScroll/)
assert.doesNotMatch(bottomSheetSource, /scrollViewHeight/)
assert.doesNotMatch(bottomSheetSource, /scroll-view-height/)
assert.doesNotMatch(bottomSheetSource, /getCurrentInstance/)
assert.match(bottomSheetSource, /:scroll-y="true"/)
assert.match(bottomSheetSource, /:enable-flex="true"/)
assert.match(bottomSheetSource, /:scroll-into-view="effectiveScrollIntoView"/)
assert.match(bottomSheetSource, /:scroll-top="effectiveScrollTop"/)
assert.match(bottomSheetSource, /scrollIntoView: \{ type: String, default: '' \}/)
assert.match(bottomSheetSource, /scrollTop: \{ type: Number, default: 0 \}/)
assert.match(bottomSheetSource, /scrollWithAnimation: \{ type: Boolean, default: true \}/)
assert.match(bottomSheetSource, /scrollAnchoring: \{ type: Boolean, default: true \}/)
assert.match(
  bottomSheetSource,
  /const panelMaxHeight = computed\(\(\) => `\$\{getMaxAvailableHeight\(\)\}px`\)/
)
assert.match(bottomSheetSource, /const panelStyle = computed\(\(\) =>/)
assert.match(bottomSheetSource, /height: panelMaxHeight\.value, maxHeight: panelMaxHeight\.value/)
assert.match(bottomSheetSource, /const internalScrollIntoView = ref\(''\)/)
assert.match(bottomSheetSource, /const effectiveScrollIntoView = computed/)
assert.match(bottomSheetSource, /async function scrollToAnchor/)
assert.match(bottomSheetSource, /function scrollToTop/)
assert.match(
  bottomSheetSource,
  /defineExpose\(\{ open, close, refreshLayout: \(\) => \{\}, scrollToAnchor, scrollToTop \}\)/
)

assert.match(wateringReminderSource, /height-mode="fullHeight"/)
assert.doesNotMatch(wateringReminderSource, /fixedScroll|scroll-view-height/)
assert.match(potProfileEditorSource, /height-mode="fullHeight"/)
assert.doesNotMatch(potProfileEditorSource, /fixedScroll|scroll-view-height/)
assert.match(diagnosePopupSource, /height-mode="fullHeight"/)
assert.doesNotMatch(diagnosePopupSource, /fixedScroll|scroll-view-height/)
