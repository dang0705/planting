<template>
  <uni-popup ref="popup" id="diagnose-popup" type="bottom" :safe-area="false" @change="handleChange">
    <view id="diagnose-popup-panel" class="bg-white rounded-t-3xl popup-panel" :style="popupPanelStyle">
      <view
        v-if="automationEnabled"
        id="diagnose-automation-inject-button"
        class="diagnose-automation-trigger"
        @click="injectAutomationDiagnoseImagesFromStorage"
      />
      <view id="diagnose-popup-header" class="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <text class="text-lg font-semibold text-gray-900">AI 诊断</text>
        <view id="diagnose-popup-close-button" class="w-8 h-8 flex items-center justify-center" @click="close">
          <text class="text-gray-400 text-2xl">×</text>
        </view>
      </view>

      <view id="diagnose-popup-content-wrap" class="popup-content-wrap">
        <scroll-view id="diagnose-popup-scroll" scroll-y class="popup-scroll">
          <view id="diagnose-popup-content" class="px-4 py-4">
        <view v-if="!result" id="diagnose-upload-stage">
          <view id="diagnose-upload-section" class="mb-4">
            <text class="block text-base font-semibold text-gray-900 mb-2">拍摄植物照片</text>
            <text class="block text-xs text-gray-500 mb-3">请直接在槽位中上传。单槽最多 2 张，总计最多 3 张。</text>

            <view id="diagnose-dev-visual-evidence-panel" class="dev-visual-evidence-panel">
              <view class="flex items-start justify-between gap-2 mb-2">
                <view class="min-w-0 flex-1">
                  <text class="block text-xs font-semibold text-[#1F5A42]">无图症状模式</text>
                  <text class="block text-[10px] text-gray-500 mt-0.5">
                    没有照片时可直接选择症状模式，进入问诊；已上传照片时仍走图片诊断。
                  </text>
                </view>
                <text class="dev-visual-evidence-tag">问诊</text>
              </view>

              <view id="3ef72261--diagnose-dev-symptom-class-quick-select" class="dev-visual-evidence-quick-select">
                <view
                  v-for="item in SYMPTOM_CLASS_QUICK_SELECT_OPTIONS"
                  :key="item.classKey"
                  :id="`diagnose-dev-symptom-class-option-${item.classKey}`"
                  class="dev-visual-evidence-quick-option"
                  :class="selectedDevSymptomClassKey === item.classKey ? 'dev-visual-evidence-quick-option--active' : ''"
                  @click="handleSymptomClassQuickSelect(item)"
                >
                  <text>{{ item.classNameCn }}</text>
                </view>
              </view>

              <view v-if="selectedDevSymptomClassOption" id="diagnose-dev-symptom-class-status" class="dev-visual-evidence-status">
                <text class="flex-1 text-[10px] text-[#1F5A42] leading-relaxed">
                  将以无图症状模式开始问诊：{{ selectedDevSymptomClassOption.symptomCn }}（{{ selectedDevSymptomClassOption.classNameCn }}）
                </text>
                <text
                  id="diagnose-dev-symptom-class-clear-button"
                  class="dev-visual-evidence-clear"
                  @click="clearDevSymptomClass"
                >
                  清空
                </text>
              </view>
            </view>

            <view id="diagnose-upload-slot-grid" class="slot-grid">
              <view
                v-for="slot in primarySlotGroups"
                :key="slot.slotType"
                :id="`diagnose-upload-slot-${slot.slotType}`"
                class="slot-card bg-[#F8F6F0] border border-white/80"
              >
                <view class="flex items-start justify-between gap-2 mb-2">
                  <view class="min-w-0 flex-1">
                    <text class="block text-xs font-semibold text-gray-900">{{ slot.label }}</text>
                    <text class="block text-[10px] text-gray-500 mt-0.5">
                      {{ slot.items.length ? `已放入 ${slot.items.length} 张` : '点击上传到此槽位' }}
                    </text>
                  </view>
                  <text class="text-[10px] text-[#8B7355]">{{ slot.items.length }}/{{ slot.capacity }}</text>
                </view>

                <view class="slot-thumb-grid">
                  <view
                    v-for="entry in slot.items"
                    :key="entry.item.id"
                    class="relative aspect-square bg-white rounded-xl overflow-hidden"
                  >
                    <image :src="entry.item.previewUrl" class="w-full h-full" mode="aspectFill" />
                    <view
                      v-if="entry.item.loading"
                      class="absolute inset-0 bg-white/75 flex flex-col items-center justify-center"
                    >
                      <view class="upload-spinner mb-2" />
                      <text class="text-[11px] text-[#2D6A4F] font-medium">上传中</text>
                    </view>
                    <view
                      v-else-if="entry.item.status === 'error'"
                      class="absolute inset-x-0 bottom-0 bg-red-500/90 px-2 py-1"
                    >
                      <text class="block text-[10px] text-white leading-tight">
                        {{ entry.item.error || '上传失败' }}
                      </text>
                    </view>
                    <view
                      class="absolute top-1 right-1 bg-red-500 rounded-full w-5 h-5 flex items-center justify-center"
                      :id="`diagnose-remove-image-${entry.index}-button`"
                      @click.stop="removeImage(entry.index)"
                    >
                      <text class="text-white text-xs">×</text>
                    </view>
                  </view>

                  <view
                    v-if="slot.canAdd"
                    :id="`diagnose-upload-${slot.slotType}-button`"
                    class="aspect-square bg-white rounded-xl flex flex-col items-center justify-center border border-dashed border-[#B7DCC5]"
                    @click="chooseImage(slot.slotType)"
                  >
                    <text class="text-xl text-[#8FB69B] mb-0.5">+</text>
                    <text class="text-[9px] text-[#8FB69B] text-center px-1">
                      {{ slot.items.length ? '继续上传' : '上传到此槽位' }}
                    </text>
                  </view>
                </view>
              </view>
            </view>

            <text id="diagnose-upload-count" class="block text-[10px] text-gray-400 text-center mt-2">
              {{ imageFiles.length }}/{{ PRIMARY_IMAGE_LIMIT }} 张
            </text>
            <text v-if="hasPendingUploads" id="diagnose-upload-pending-status" class="block text-[10px] text-[#2D6A4F] text-center mt-1">
              图片上传中，全部处理完成后可开始诊断
            </text>
            <text v-else-if="hasUploadErrors" id="diagnose-upload-error-status" class="block text-[10px] text-red-500 text-center mt-1">
              存在上传失败的图片，请删除后重新添加
            </text>
          </view>

          <view id="diagnose-capture-guidance" class="mt-3 bg-[#D8F3DC] rounded-xl p-3">
            <text class="block text-xs font-semibold text-primary mb-1">拍摄建议</text>
            <text class="block text-[10px] text-gray-700 leading-relaxed">
              • 光线充足，避免逆光
            </text>
            <text class="block text-[10px] text-gray-700 leading-relaxed">
              • 优先保留叶片特写、茎部或根颈近照、整株图
            </text>
            <text class="block text-[10px] text-gray-700 leading-relaxed">
              • 若已知部位，请为每张图选择对应槽位
            </text>
          </view>
        </view>

        <view v-if="result" id="diagnose-result-stage">
          <view id="diagnose-result-plant-card" class="bg-gray-50 rounded-xl p-3 mb-3">
            <view class="flex items-center mb-2">
              <text class="text-2xl mr-2">🌿</text>
              <view class="flex-1">
                <text class="block text-base font-semibold text-gray-900">{{ result.plantName }}</text>
                <text class="block text-xs text-gray-500">{{ result.scientificName || '学名未知' }}</text>
              </view>
            </view>

            <view class="flex items-center justify-between p-2 bg-white rounded-lg">
              <text class="text-xs font-semibold text-gray-700">健康状态</text>
              <view :class="getHealthClass(result.healthStatusText)">
                <text class="text-xs font-bold">{{ result.healthStatusText }}</text>
              </view>
            </view>
          </view>

          <view v-if="result.observedSymptoms?.length" id="diagnose-result-observed-symptoms" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">观察到的症状</text>
            <view class="bg-gray-50 rounded-xl p-3 flex flex-wrap gap-2">
              <view
                v-for="item in result.observedSymptoms"
                :key="item.symptomKey"
                class="px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-[11px]"
              >
                {{ item.symptomCn || '待确认症状' }}
              </view>
            </view>
          </view>

          <view v-if="allOutcomeDisplays.length || resultMainIssueText || resultSummaryText" id="diagnose-result-current-conclusion" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">诊断结论</text>
            <view class="bg-gray-50 rounded-xl p-3">
              <view v-if="allOutcomeDisplays.length" class="mb-2">
                <text
                  v-for="(item, index) in allOutcomeDisplays"
                  :key="`result_outcome_${index}`"
                  class="block text-xs text-gray-800 font-semibold leading-relaxed mb-1 last:mb-0"
                >
                  {{ item }}
                </text>
              </view>
              <text v-else class="block text-xs text-gray-800 mb-2">{{ resultMainIssueText }}</text>
              <text class="block text-xs text-gray-600 leading-relaxed whitespace-pre-line">{{ resultSummaryText }}</text>
            </view>
          </view>

          <view v-if="actionAdviceGroups.length" id="diagnose-result-action-advice" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">处理建议</text>
            <view class="bg-[#F3FAF5] rounded-xl p-3">
              <view v-for="group in actionAdviceGroups" :key="`action_${group.key}`" class="mb-2 last:mb-0">
                <text class="block text-[11px] text-gray-800 font-semibold mb-1">{{ group.outcomeLabel }}：</text>
                <text
                  v-for="(item, index) in group.items"
                  :key="`action_${group.key}_${index}`"
                  class="block text-xs text-gray-700 leading-relaxed mb-2 last:mb-0"
                >
                  {{ index + 1 }}. {{ item }}
                </text>
              </view>
            </view>
          </view>

          <view v-if="avoidAdviceGroups.length" id="diagnose-result-avoid-advice" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">暂时不要做</text>
            <view class="bg-[#FFF6F3] rounded-xl p-3">
              <view v-for="group in avoidAdviceGroups" :key="`avoid_${group.key}`" class="mb-2 last:mb-0">
                <text class="block text-[11px] text-gray-800 font-semibold mb-1">{{ group.outcomeLabel }}：</text>
                <text
                  v-for="(item, index) in group.items"
                  :key="`avoid_${group.key}_${index}`"
                  class="block text-xs text-gray-700 leading-relaxed mb-2 last:mb-0"
                >
                  {{ index + 1 }}. {{ item }}
                </text>
              </view>
            </view>
          </view>

          <view v-if="hasActiveDiagnosisQuestions" id="diagnose-result-question-package-required" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">继续问诊</text>
            <view class="bg-gray-50 rounded-xl p-3">
              <text class="block text-[10px] text-gray-500 mb-3">
                每次只回答一个关键问题。答题与补图是两种正式方式，需要分开提交。
              </text>
              <view
                v-if="currentQuestion"
                id="diagnose-question-package-swiper"
                class="question-package-swiper"
              >
                <view class="question-package-swiper-track" :style="questionSwiperTrackStyle">
                  <view
                    v-for="(question, pageIndex) in questionSwiperPages"
                    :key="question?.questionId || `question-package-placeholder-${pageIndex}`"
                    class="question-package-swiper-item"
                  >
                    <view
                      v-if="question"
                      :key="question.questionId"
                      :id="`diagnose-question-package-question-${question.questionId}`"
                      class="question-package-question-card question-package-question-card--animated"
                    >
                      <text class="block text-[10px] text-[#8B7355] mb-1">
                        当前问题 {{ activeQuestionIndex + 1 }} / {{ questionStack.length || 1 }}
                      </text>
                      <text class="block text-xs font-semibold text-gray-900 leading-relaxed mb-1">
                        {{ getQuestionTitle(question) }}
                      </text>
                      <text
                        v-if="getQuestionHelpText(question)"
                        class="block text-[10px] text-gray-500 leading-relaxed mb-3"
                      >
                        {{ getQuestionHelpText(question) }}
                      </text>
                      <CareBehaviorTimeline
                        v-if="isCareBehaviorWateringTimelineQuestion(question)"
                        :question-id="getQuestionId(question)"
                        :question="question"
                        :timeline="getCareBehaviorTimelineByQuestion(question)"
                        :loading="environmentWeatherWindowLoading"
                        :error="environmentWeatherWindowError"
                        @change="payload => handleCareBehaviorTimelineChange(question, payload)"
                      />
                      <view
                        :id="`diagnose-question-package-option-stack-${question.questionId}`"
                        v-if="getVisibleCareBehaviorOptions(question).length"
                        class="question-package-option-stack"
                        :class="question.uiVariant === 'single_select_accordion' ? 'question-package-option-stack--accordion' : ''"
                      >
                        <uni-collapse
                          v-if="isAccordionQuestion(question)"
                          v-model="currentQuestionAccordionValue"
                          accordion
                          :border="false"
                          class="question-package-option-collapse"
                          @change="handleQuestionAccordionChange(question, $event)"
                        >
                          <uni-collapse-item
                            v-for="option in getVisibleCareBehaviorOptions(question)"
                            :key="option.optionId"
                            :name="option.optionId"
                            :title="getOptionText(question, option)"
                            :border="false"
                            :title-border="false"
                            class="question-package-option-collapse-item"
                          >
                            <template #title>
                              <view
                                class="question-package-option-accordion-title"
                              :class="
                                isSelectedQuestionOption(question, option)
                                  ? 'question-package-option-accordion-title--active'
                                  : 'question-package-option-accordion-title--idle'
                              "
                            >
                              <text class="question-package-option-accordion-text">{{ getOptionText(question, option) }}</text>
                              <text class="question-package-option-accordion-badge">
                                {{ isSelectedQuestionOption(question, option) ? '已选' : '单选' }}
                              </text>
                            </view>
                          </template>
                          <view
                            :id="`diagnose-question-package-option-${question.questionId}-${option.optionId}`"
                            class="question-package-option-collapse-body"
                            :class="
                              isSelectedQuestionOption(question, option)
                                ? 'question-package-option-collapse-body--active'
                                : ''
                            "
                            @click.stop="selectQuestionOption(question, option)"
                          >
                              <text class="question-package-option-description">
                                {{ getOptionDescription(option) || '选择这一项后继续下一步排查。' }}
                              </text>
                            </view>
                          </uni-collapse-item>
                        </uni-collapse>
                        <template v-else>
                          <view
                            v-for="option in getVisibleCareBehaviorOptions(question)"
                            :key="option.optionId"
                            :id="`diagnose-question-package-option-${question.questionId}-${option.optionId}`"
                            class="question-package-option-button"
                            style="width: 100%; display: flex; justify-content: flex-start; text-align: left;"
                            :class="
                              questionAnswers[question.questionId] === option.optionId
                                ? 'question-package-option-button--active'
                                : 'question-package-option-button--idle'
                            "
                            @click="selectQuestionOption(question, option)"
                          >
                            <view class="question-package-option-content">
                              <view class="question-package-option-title-row">
                                <text class="question-package-option-text">{{ getOptionText(question, option) }}</text>
                              </view>
                              <text
                                v-if="getOptionDescription(option)"
                                class="question-package-option-description"
                              >
                                {{ getOptionDescription(option) }}
                              </text>
                            </view>
                          </view>
                        </template>
                      </view>
                      <view class="question-package-nav-row">
                        <button
                          id="diagnose-question-package-prev-button"
                          class="question-package-nav-button"
                          :class="{ 'question-package-nav-button--disabled': isSubmittingQuestionFlow || activeQuestionIndex <= 0 }"
                          :disabled="isSubmittingQuestionFlow || activeQuestionIndex <= 0"
                          @click="goPreviousQuestion"
                        >
                          上一题
                        </button>
                        <button
                          id="diagnose-question-package-next-button"
                          class="question-package-nav-button"
                          :class="{ 'question-package-nav-button--disabled': !canProceedQuestion() }"
                          :disabled="!canProceedQuestion()"
                          @click="handleNextQuestion"
                        >
                          下一题
                        </button>
                      </view>
                      <text
                        v-if="hasDirtyQuestionAnswers"
                        class="block text-[10px] text-[#8B7355] leading-relaxed mt-2"
                      >
                        你修改了之前的答案，点下一题后后续问题会交给后端重新判断。
                      </text>
                    </view>
                  </view>
                </view>
              </view>
              <view v-else id="diagnose-question-package-empty-question" class="px-3 py-2 rounded-xl bg-white border border-gray-100">
                <text class="block text-[10px] text-gray-500">
                  当前没有可继续回答的问题。
                </text>
              </view>
              <text
                v-if="additionalImageFiles.length || hasPendingAdditionalImageUploads || hasAdditionalImageUploadErrors"
                class="block text-[10px] text-[#8B7355] mt-3"
              >
                当前有待处理补图，请先完成补图提交或清空补图后再继续下一题。
              </text>
            </view>
          </view>

          <view v-if="hasActiveDiagnosisQuestions" id="diagnose-question-package-image-section" class="mb-3">
            <text class="block text-sm font-semibold text-gray-900 mb-2">补充图片</text>
            <view class="bg-[#F8F6F0] rounded-xl p-3 border border-[#D8F3DC]">
              <text class="block text-[10px] text-gray-500 mb-2">
                当前阶段最多补图 1 次。若补图，将生成新的视觉调用批次并重建视觉证据。
              </text>

              <view v-if="additionalImageCaptureSuggestions.length" id="diagnose-question-package-capture-suggestions" class="mb-3">
                <text class="block text-[11px] font-semibold text-gray-800 mb-1">建议优先补拍</text>
                <view
                  v-for="item in additionalImageCaptureSuggestions"
                  :key="item"
                  class="mb-1 last:mb-0 px-2.5 py-2 rounded-lg bg-white text-[11px] text-gray-700"
                >
                  {{ item }}
                </view>
              </view>

              <view v-if="canShowAdditionalImageUploader">
                <view id="diagnose-question-package-upload-slot-grid" class="slot-grid">
                  <view
                    v-for="slot in additionalImageSlotGroups"
                    :key="slot.slotType"
                    :id="`diagnose-question-package-upload-slot-${slot.slotType}`"
                    class="slot-card bg-white border border-[#E7E0D1]"
                  >
                    <view class="flex items-start justify-between gap-2 mb-2">
                      <view class="min-w-0 flex-1">
                        <text class="block text-xs font-semibold text-gray-900">{{ slot.label }}</text>
                        <text class="block text-[10px] text-gray-500 mt-0.5">
                          {{ slot.items.length ? `已放入 ${slot.items.length} 张` : '点击补到此槽位' }}
                        </text>
                      </view>
                      <text class="text-[10px] text-[#8B7355]">{{ slot.items.length }}/{{ slot.capacity }}</text>
                    </view>

                    <view class="slot-thumb-grid">
                      <view
                        v-for="entry in slot.items"
                        :key="entry.item.id"
                        class="relative aspect-square bg-[#F8F6F0] rounded-xl overflow-hidden"
                      >
                        <image :src="entry.item.previewUrl" class="w-full h-full" mode="aspectFill" />
                        <view
                          v-if="entry.item.loading"
                          class="absolute inset-0 bg-white/75 flex flex-col items-center justify-center"
                        >
                          <view class="upload-spinner mb-2" />
                          <text class="text-[11px] text-[#2D6A4F] font-medium">上传中</text>
                        </view>
                        <view
                          v-else-if="entry.item.status === 'error'"
                          class="absolute inset-x-0 bottom-0 bg-red-500/90 px-2 py-1"
                        >
                          <text class="block text-[10px] text-white leading-tight">
                            {{ entry.item.error || '上传失败' }}
                          </text>
                        </view>
                        <view
                          class="absolute top-1 right-1 bg-red-500 rounded-full w-5 h-5 flex items-center justify-center"
                          :id="`diagnose-question-package-remove-image-${entry.index}-button`"
                          @click.stop="removeAdditionalImage(entry.index)"
                        >
                          <text class="text-white text-xs">×</text>
                        </view>
                      </view>

                      <view
                        v-if="slot.canAdd"
                        :id="`diagnose-question-package-upload-${slot.slotType}-button`"
                        class="aspect-square bg-[#FFFDF8] rounded-xl flex flex-col items-center justify-center border border-dashed border-[#B7DCC5]"
                        @click="chooseAdditionalImage(slot.slotType)"
                      >
                        <text class="text-xl text-[#8FB69B] mb-0.5">+</text>
                        <text class="text-[9px] text-[#8FB69B] text-center px-1">补到此槽位</text>
                      </view>
                    </view>
                  </view>
                </view>

                <view class="flex items-center justify-between mt-3 mb-1">
                  <text class="text-[10px] text-gray-400">
                    {{ additionalImageFiles.length }}/{{ ADDITIONAL_IMAGE_LIMIT }} 张
                  </text>
                  <text
                    id="diagnose-question-package-clear-images-button"
                    class="text-[10px] text-[#8B7355]"
                    @click="resetAdditionalImages"
                  >清空补图</text>
                </view>
                <text v-if="hasPendingAdditionalImageUploads" class="block text-[10px] text-[#2D6A4F] text-center mt-1">
                  补图上传中，处理完成后可提交
                </text>
                <text v-else-if="hasAdditionalImageUploadErrors" class="block text-[10px] text-red-500 text-center mt-1">
                  存在上传失败的补图，请删除后重新添加
                </text>

              </view>

              <view v-else id="diagnose-question-package-upload-blocked" class="px-3 py-2.5 rounded-xl bg-white">
                <text class="block text-[11px] text-gray-600">
                  {{ additionalImageUploadBlockedReason }}
                </text>
              </view>
            </view>
          </view>

        </view>
          </view>
        </scroll-view>
      </view>

      <view id="diagnose-popup-footer" class="popup-footer">
        <view v-if="!result" id="diagnose-popup-footer-start">
          <button
            id="diagnose-submit-button"
            class="w-full bg-primary text-white font-semibold py-3 rounded-xl"
            :class="{ 'opacity-50': !canStartDiagnose() }"
            :disabled="!canStartDiagnose()"
            @click="startDiagnose"
          >
            开始诊断
          </button>
        </view>

        <view v-else id="diagnose-popup-footer-result-actions" class="space-y-2">
          <button
            v-if="hasActiveDiagnosisQuestions && canShowAdditionalImageUploader"
            id="diagnose-question-package-image-submit-button"
            class="w-full bg-[#2D6A4F] text-white py-2.5 rounded-xl text-sm"
            :class="{ 'opacity-50': isSubmittingQuestionFlow || !canSubmitAdditionalImages() }"
            :disabled="isSubmittingQuestionFlow || !canSubmitAdditionalImages()"
            @click="submitAdditionalImages"
          >
            {{ isSubmittingAdditionalImage ? '补图诊断中...' : '提交补图并重新诊断' }}
          </button>

          <view class="flex gap-2">
            <button
              id="diagnose-reset-button"
              class="flex-1 bg-white border border-primary text-primary font-semibold py-2.5 rounded-xl text-sm"
              @click="resetDiagnose"
            >
              重新诊断
            </button>
            <button
              id="diagnose-finish-button"
              class="flex-1 bg-primary text-white font-semibold py-2.5 rounded-xl text-sm"
              @click="close"
            >
              完成
            </button>
          </view>
        </view>
      </view>
    </view>

    <AIStreamDialog
      ref="aiStreamDialogRef"
      :visible="showAIDialog"
      title="AI 智能诊断"
      icon="🩺"
      loading-text="正在诊断植物健康..."
      confirm-text="进入问诊"
      cancel-text="稍后再说"
      :show-cancel="true"
      @close="handleAIDialogClose"
      @cancel="handleAIDialogCancel"
      @confirm="handleAIDialogConfirm"
      @retry="handleAIRetry"
    />
  </uni-popup>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useUserStore } from '@/store/user.js'
import { useDiagnoseStore } from '@/store/diagnose.js'
import { useCloudImageUploader } from '@/composables/useCloudImageUploader'
import { useDiagnoseMutation } from '@/vue-query/diagnose/mutations/useDiagnoseMutation.js'
import { useDiagnosisQuestionStartMutation } from '@/vue-query/diagnose/mutations/useDiagnosisQuestionStartMutation.js'
import { useDiagnosisAnswerMutation } from '@/vue-query/diagnose/mutations/useDiagnosisAnswerMutation.js'
import { getEnvironmentWeatherWindow } from '@/api/weather.js'
import CareBehaviorTimeline from '@/components/CareBehaviorTimeline.vue'
import {
  normalizeDiagnosisResult,
  createQuestionAnswerMap,
  isQuestionAnswerComplete,
  buildQuestionAnswerPayload,
  getHealthClass
} from '@/utils/diagnose-flow.js'
import {
  extractCareBehaviorTimelineFromQuestion,
  getVisibleCareBehaviorOptions,
  hasMeaningfulCareBehaviorTimeline,
  isCareBehaviorTimelineSentinelAnswer,
  isLegacyWateringTimelineQuestion,
  isCareBehaviorWateringTimelineQuestion,
  normalizeCareBehaviorTimeline,
  resolveCareBehaviorTimelineAutoAnswerOptionId,
  resolveCareBehaviorTimelineRecordedAnswerOptionId
} from '@/utils/care-behavior-timeline.js'
import { mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline } from '@/utils/care-behavior-weather-window.js'
import {
  PRIMARY_IMAGE_LIMIT,
  ADDITIONAL_IMAGE_LIMIT,
  PRIMARY_SLOT_SEQUENCE,
  ADDITIONAL_IMAGE_SLOT_SEQUENCE,
  getOrganOptionLabel,
  normalizeSlotType,
  getSlotCapacity,
  getSlotFileCount,
  buildSlotGroups,
  buildSlotMetadata,
  inferAdditionalImageSlotTypeFromSuggestion
} from '@/utils/diagnose-image-slots.js'
import AIStreamDialog from './AIStreamDialog.vue'

const props = defineProps({
  plantId: {
    type: [String, Number],
    default: ''
  },
  plantName: {
    type: String,
    default: ''
  },
  observedSymptoms: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['success', 'close'])

const userStore = useUserStore()
const diagnoseStore = useDiagnoseStore()

const popup = ref(null)
const result = ref(null)
const showAIDialog = ref(false)
const aiStreamDialogRef = ref(null)
const pendingDiagnosePayload = ref(null)
const casePreviewImages = ref([])
const questionAnswers = ref({})
const careBehaviorTimelineByQuestionId = ref({})
const environmentWeatherWindow = ref(null)
const environmentWeatherWindowRequestKey = ref('')
const environmentWeatherWindowLoading = ref(false)
const questionStack = ref([])
const activeQuestionIndex = ref(0)
const committedQuestionAnswers = ref({})
const dirtyQuestionFromIndex = ref(-1)
const questionAnswerRevision = ref(0)
const expandedQuestionOptionByQuestion = ref({})
const submittingQuestionMode = ref('')
const viewportHeight = ref(0)
const tabBarOccupiedHeight = ref(50)
const questionSwiperCurrent = ref(0)
const questionSwiperPages = ref([null, null])

const diagnoseMutation = useDiagnoseMutation()
const questionStartMutation = useDiagnosisQuestionStartMutation()
const diagnosisAnswerMutation = useDiagnosisAnswerMutation()

const uploader = useCloudImageUploader({
  count: PRIMARY_IMAGE_LIMIT,
  size: 5,
  suffix: ['jpg', 'jpeg', 'png', 'webp'],
  sizeType: ['compressed'],
  compressionRate: 72,
  compressionTargetSize: 0.45,
  forceCompression: true,
  preserveImageDetails: false
})
const additionalImageUploader = useCloudImageUploader({
  count: ADDITIONAL_IMAGE_LIMIT,
  size: 5,
  suffix: ['jpg', 'jpeg', 'png', 'webp'],
  sizeType: ['compressed'],
  compressionRate: 72,
  compressionTargetSize: 0.45,
  forceCompression: true,
  preserveImageDetails: false
})

const imageFiles = uploader.files
const hasPendingUploads = uploader.hasPendingUploads
const hasUploadErrors = uploader.hasUploadErrors
const additionalImageFiles = additionalImageUploader.files
const hasPendingAdditionalImageUploads = additionalImageUploader.hasPendingUploads
const hasAdditionalImageUploadErrors = additionalImageUploader.hasUploadErrors
const runtimeEnv = import.meta.env || {}
const isLocalDevelopmentBuild = Boolean(runtimeEnv.DEV) || runtimeEnv.MODE === 'development'
let automationEnabled =
  runtimeEnv.VITE_APP_ENV === 'development' ||
  (isLocalDevelopmentBuild && runtimeEnv.VITE_APP_ENV !== 'production')
// #ifdef MP-WEIXIN
automationEnabled =
  runtimeEnv.VITE_APP_ENV === 'development' ||
  (!runtimeEnv.PROD && runtimeEnv.VITE_APP_ENV !== 'production')
// #endif
const AUTOMATION_DIAGNOSE_IMAGES_STORAGE_KEY = '__plantsight_diagnose_automation_images__'
const DIAGNOSIS_QUESTION_PACKAGE_STORAGE_KEY_PREFIX = '__plantsight_diagnose_question_package__'
const SYMPTOM_CLASS_QUICK_SELECT_OPTIONS = [
  { classKey: 'yellowing_mode', classNameCn: '黄叶模式', symptomKey: 'uniform_yellowing', symptomCn: '整叶黄化' },
  { classKey: 'bacterial_leaf_spot_mode', classNameCn: '细菌性叶斑模式', symptomKey: 'water_soaked_spots', symptomCn: '水渍斑' },
  { classKey: 'chewing_pest_mode', classNameCn: '咀嚼损伤虫害模式', symptomKey: 'holes_in_leaf', symptomCn: '叶片穿孔' },
  { classKey: 'edema_overwater_mode', classNameCn: '水肿/过湿模式', symptomKey: 'edema', symptomCn: '水肿' },
  { classKey: 'flower_stress_mode', classNameCn: '花器胁迫模式', symptomKey: 'bud_drop', symptomCn: '掉花苞' },
  { classKey: 'fungal_leaf_spot_mode', classNameCn: '真菌性叶斑模式', symptomKey: 'brown_spots_halo', symptomCn: '褐斑带黄晕' },
  { classKey: 'general_stress_mode', classNameCn: '泛胁迫兜底模式', symptomKey: 'distorted_growth', symptomCn: '整体畸形' },
  { classKey: 'gray_mold_mode', classNameCn: '灰霉模式', symptomKey: 'gray_fuzzy_mold', symptomCn: '灰色绒霉' },
  { classKey: 'humidity_stress_mode', classNameCn: '湿度胁迫模式', symptomKey: 'low_humidity_damage', symptomCn: '低湿伤害' },
  { classKey: 'leaf_edge_necrosis_mode', classNameCn: '叶缘坏死模式', symptomKey: 'leaf_margin_necrosis', symptomCn: '叶缘坏死' },
  { classKey: 'leaf_spot_complex_mode', classNameCn: '复合叶斑模式', symptomKey: 'irregular_blotches', symptomCn: '不规则斑块' },
  { classKey: 'leafminer_mode', classNameCn: '潜叶损伤模式', symptomKey: 'tunnels_in_leaf', symptomCn: '叶内潜道' },
  { classKey: 'light_stress_mode', classNameCn: '光照胁迫模式', symptomKey: 'leaf_bleaching', symptomCn: '叶片漂白' },
  { classKey: 'mechanical_damage_mode', classNameCn: '机械损伤模式', symptomKey: 'wind_damage', symptomCn: '风伤' },
  { classKey: 'mite_damage_mode', classNameCn: '螨害模式', symptomKey: 'fine_webbing', symptomCn: '细密蛛网' },
  { classKey: 'natural_aging_mode', classNameCn: '自然老化模式', symptomKey: 'normal_leaf_aging_stable', symptomCn: '底部老叶稳定黄化' },
  { classKey: 'nutrient_stress_mode', classNameCn: '营养胁迫模式', symptomKey: 'vein_darkening', symptomCn: '叶脉变深' },
  { classKey: 'powdery_mildew_mode', classNameCn: '白粉模式', symptomKey: 'white_fuzz', symptomCn: '白色菌丝' },
  { classKey: 'root_rot_wet_wilt_mode', classNameCn: '湿土萎蔫/根腐模式', symptomKey: 'wilting_wet_soil', symptomCn: '湿土萎蔫' },
  { classKey: 'rust_mode', classNameCn: '锈病模式', symptomKey: 'rust_pustules', symptomCn: '锈孢子堆' },
  { classKey: 'salt_dry_edge_mode', classNameCn: '盐害/干边模式', symptomKey: 'tip_burn', symptomCn: '叶尖焦枯' },
  { classKey: 'sap_sucking_honeydew_pest_mode', classNameCn: '刺吸蜜露型虫害模式', symptomKey: 'white_flies', symptomCn: '有白色小飞虫，一碰会飞起来' },
  { classKey: 'soft_rot_mode', classNameCn: '软腐模式', symptomKey: 'soft_stem', symptomCn: '茎变软' },
  { classKey: 'soil_moisture_pest_mode', classNameCn: '盆土过湿相关模式', symptomKey: 'small_flies_soil', symptomCn: '土壤小飞虫' },
  { classKey: 'temperature_stress_mode', classNameCn: '温度胁迫模式', symptomKey: 'heat_stress', symptomCn: '高温胁迫' },
  { classKey: 'thrips_damage_mode', classNameCn: '蓟马损伤模式', symptomKey: 'yellow_speckling', symptomCn: '点刺状黄化' },
  { classKey: 'virus_mosaic_mode', classNameCn: '病毒花叶模式', symptomKey: 'leaf_mosaic_mottling', symptomCn: '叶子上有深浅不一、花花绿绿的斑驳花纹' },
  { classKey: 'water_stress_mode', classNameCn: '水分胁迫模式', symptomKey: 'wilting_dry_soil', symptomCn: '干土萎蔫' }
]

const selectedDevSymptomClassKey = ref('')

const primaryStructuredImages = computed(() => buildStructuredImageInputs(imageFiles.value))
const additionalStructuredImages = computed(() => buildStructuredImageInputs(additionalImageFiles.value))
const selectedDevSymptomClassOption = computed(() =>
  SYMPTOM_CLASS_QUICK_SELECT_OPTIONS.find(item => item.classKey === selectedDevSymptomClassKey.value) || null
)
const hasSelectedSymptomMode = computed(() => Boolean(selectedDevSymptomClassOption.value))
const additionalImageCaptureSuggestions = computed(() =>
  Array.isArray(result.value?.visualAggregateSummary?.suggestedAdditionalImageCapture)
    ? result.value.visualAggregateSummary.suggestedAdditionalImageCapture
    : []
)
const additionalImageSlotTypes = computed(() => {
  const inferredSlotTypes = uniqueStrings(
    additionalImageCaptureSuggestions.value.map(item => inferAdditionalImageSlotTypeFromSuggestion(item, 'whole_plant'))
  )

  if (inferredSlotTypes.length) {
    return uniqueStrings([...inferredSlotTypes, 'other'])
  }

  return [...ADDITIONAL_IMAGE_SLOT_SEQUENCE]
})
const primarySlotGroups = computed(() =>
  buildSlotGroups(imageFiles.value, PRIMARY_SLOT_SEQUENCE, PRIMARY_IMAGE_LIMIT)
)
const additionalImageSlotGroups = computed(() =>
  buildSlotGroups(additionalImageFiles.value, additionalImageSlotTypes.value, ADDITIONAL_IMAGE_LIMIT)
)
const hasUsedAdditionalImageSubmission = computed(() => detectUsedAdditionalImageSubmission(result.value))
const activeDiagnosisQuestions = computed(() =>
  Array.isArray(result.value?.questions)
    ? result.value.questions.filter(item => item?.questionId)
    : []
)
const hasActiveDiagnosisQuestions = computed(() =>
  Boolean(result.value?.hasActiveQuestions && activeDiagnosisQuestions.value.length)
)
const canShowAdditionalImageUploader = computed(
  () => Boolean(hasActiveDiagnosisQuestions.value && result.value?.uiHints?.canUploadMoreImages)
)
const additionalImageUploadBlockedReason = computed(() => {
  if (!hasActiveDiagnosisQuestions.value) {
    return '当前没有开放补图。'
  }

  if (hasUsedAdditionalImageSubmission.value) {
    return '本次会话的补图机会已使用，请继续答题或重新开始新的诊断。'
  }

  return '当前轮次没有开放补图入口，请优先回答问题。'
})
const isSubmittingQuestionFlow = computed(() => Boolean(submittingQuestionMode.value))
const isSubmittingQuestionAnswer = computed(() => submittingQuestionMode.value === 'answers')
const isSubmittingAdditionalImage = computed(() => submittingQuestionMode.value === 'images')
const currentQuestion = computed(() => {
  const items = Array.isArray(questionStack.value) ? questionStack.value : []
  return items[activeQuestionIndex.value] || null
})
const hasDirtyQuestionAnswers = computed(() => dirtyQuestionFromIndex.value >= 0)
const questionSwiperTrackStyle = computed(() =>
  `transform: translateX(-${questionSwiperCurrent.value * 100}%);`
)
const currentQuestionAccordionValue = computed({
  get() {
    const question = currentQuestion.value
    if (!isAccordionQuestion(question)) {return ''}
    return getExpandedQuestionOptionId(question)
  },
  set(value) {
    const question = currentQuestion.value
    if (!isAccordionQuestion(question)) {return}
    const optionId = normalizeCollapseOptionValue(value)
    if (!optionId) {return}
    setExpandedQuestionOption(question, optionId)
    setQuestionAnswer(getQuestionId(question), optionId)
  }
})

watch(
  currentQuestion,
  async question => {
    if (!question) {
      questionSwiperPages.value = [null, null]
      questionSwiperCurrent.value = 0
      return
    }

    const activeIndex = questionSwiperCurrent.value
    const activeQuestion = questionSwiperPages.value[activeIndex]
    const questionId = getQuestionId(question)

    if (!activeQuestion) {
      questionSwiperPages.value = [question, null]
      questionSwiperCurrent.value = 0
      return
    }

    if (getQuestionId(activeQuestion) === questionId) {
      questionSwiperPages.value = questionSwiperPages.value.map((item, index) =>
        index === activeIndex ? question : item
      )
      return
    }

    const nextIndex = activeIndex === 0 ? 1 : 0
    questionSwiperPages.value = questionSwiperPages.value.map((item, index) =>
      index === nextIndex ? question : item
    )
    await nextTick()
    questionSwiperCurrent.value = nextIndex
  },
  { immediate: true }
)
const actionAdviceTexts = computed(() => {
  const explanation = result.value?.explanation || result.value?.resultExplanation || {}
  const nextSteps = Array.isArray(result.value?.nextSteps)
    ? result.value.nextSteps.map(item => String(item?.text || '').trim()).filter(Boolean)
    : []
  const treatmentText = String(result.value?.treatmentText || explanation?.firstAid || '').trim()
  return uniqueStrings([...nextSteps, ...(treatmentText ? [treatmentText] : [])])
})
const resultMainIssueText = computed(() => formatOutcomeDisplayLabel(result.value?.mainIssueText))
const resultSummaryText = computed(() => formatOutcomeDisplayLabel(result.value?.summaryText))
const avoidAdviceTexts = computed(() => {
  const explanation = result.value?.explanation || result.value?.resultExplanation || {}
  const whatToAvoid = Array.isArray(result.value?.whatToAvoid)
    ? result.value.whatToAvoid.map(item => String(item || '').trim()).filter(Boolean)
    : []
  const preventionText = String(result.value?.preventionText || explanation?.avoid || '').trim()
  return uniqueStrings([...whatToAvoid, ...(preventionText ? [preventionText] : [])])
})
const visibleOutcomeSource = computed(() =>
  Array.isArray(result.value?.visibleOutcomes) && result.value.visibleOutcomes.length
    ? result.value.visibleOutcomes
    : Array.isArray(result.value?.finalResult?.visibleOutcomes)
      ? result.value.finalResult.visibleOutcomes
      : []
)
const visibleOutcomeDisplays = computed(() => uniqueStrings(visibleOutcomeSource.value.map(formatOutcomeDisplayLabel)))
const allOutcomeDisplays = computed(() => visibleOutcomeDisplays.value)
const outcomeAdviceSources = computed(() => buildUniqueOutcomesForAdvice(visibleOutcomeSource.value))
const actionAdviceGroups = computed(() =>
  buildOutcomeAdviceGroups({
    outcomeSources: outcomeAdviceSources.value,
    getOutcomeItems: buildOutcomeActionAdviceItems,
    fallbackItems: actionAdviceTexts.value,
    fallbackLabel: '通用建议'
  })
)
const avoidAdviceGroups = computed(() =>
  buildOutcomeAdviceGroups({
    outcomeSources: outcomeAdviceSources.value,
    getOutcomeItems: buildOutcomeAvoidAdviceItems,
    fallbackItems: avoidAdviceTexts.value,
    fallbackLabel: '通用建议'
  })
)
const popupHeight = computed(() => {
  const totalHeight = Number(viewportHeight.value || 0)
  const navbarHeight = Number(userStore.navbarHeight || 0)
  const bottomTabBarHeight = Number(tabBarOccupiedHeight.value || 0)
  if (!totalHeight) {
    return 640
  }
  return Math.max(420, totalHeight - navbarHeight - bottomTabBarHeight)
})
const popupPanelStyle = computed(() => ({
  height: `${popupHeight.value}px`
}))

function refreshViewportHeight() {
  try {
    const systemInfo = uni.getSystemInfoSync()
    viewportHeight.value = Math.max(
      Number(systemInfo?.screenHeight || 0),
      Number(systemInfo?.windowHeight || 0)
    )
    tabBarOccupiedHeight.value =
      50 +
      Math.max(
        Number(systemInfo?.safeAreaInsets?.bottom || 0),
        0
      )
  } catch {
    viewportHeight.value = 0
    tabBarOccupiedHeight.value = 50
  }
}

function isAccordionQuestion(question) {
  return String(question?.uiVariant || '').trim() === 'single_select_accordion'
}

function sanitizeTemplateText(value = '') {
  return String(value || '')
    .replace(/\{\{[^}]+\}/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeArrayText(values = []) {
  return (Array.isArray(values) ? values : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

function normalizeTextList(values = []) {
  return (Array.isArray(values) ? values : [values]).map(item => normalizeText(item)).filter(Boolean)
}

function normalizeUserFriendlyOutcomeLabel(value = '') {
  return String(value || '')
    .replace(/根区压力/g, '根部状态不佳')
    .replace(/根部压力/g, '根部状态不佳')
    .replace(/压力/g, '受影响')
    .trim()
}

function formatOutcomeDisplayLabel(outcome = null) {
  if (typeof outcome === 'string') {
    return normalizeUserFriendlyOutcomeLabel(String(outcome || '').trim())
  }
  if (!outcome || typeof outcome !== 'object') {
    return ''
  }
  return normalizeUserFriendlyOutcomeLabel(
    String(
      outcome.displayNameCn ||
        outcome.displayName ||
        outcome.title ||
        outcome.problemName ||
        outcome.problemKey ||
        outcome.outcomeKey ||
        ''
    ).trim()
  )
}

function normalizeOutcomeDisplayKey(outcome = {}, index = 0) {
  return String(
    outcome?.outcomeKey ||
      outcome?.problemKey ||
      outcome?.problemId ||
      outcome?.displayNameCn ||
      outcome?.displayName ||
      outcome?.title ||
      `outcome_${index}`
  ).trim()
}

function buildUniqueOutcomesForAdvice(outcomes = []) {
  const seen = new Set()
  return (Array.isArray(outcomes) ? outcomes : [])
    .map((outcome, index) => ({ outcome, index }))
    .filter(item => item.outcome && typeof item.outcome === 'object')
    .filter(item => {
      const key = normalizeOutcomeDisplayKey(item.outcome, item.index)
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .map(item => item.outcome)
}

function buildOutcomeAdviceGroups({
  outcomeSources = [],
  getOutcomeItems,
  fallbackItems = [],
  fallbackLabel = '通用建议'
} = {}) {
  const sourceGroups = buildUniqueOutcomesForAdvice(outcomeSources)
    .map((outcome, index) => ({
      key: normalizeOutcomeDisplayKey(outcome, index),
      outcomeLabel: formatOutcomeDisplayLabel(outcome),
      items: uniqueStrings(getOutcomeItems ? getOutcomeItems(outcome) : [])
    }))
    .filter(group => group.outcomeLabel && group.items.length)

  if (sourceGroups.length || !fallbackItems.length) {
    return sourceGroups
  }

  return [{
    key: '__fallback__',
    outcomeLabel: fallbackLabel,
    items: uniqueStrings(fallbackItems)
  }]
}

function buildOutcomeActionAdviceItems(outcome = {}) {
  return uniqueStrings([
    ...normalizeTextList(outcome?.actionAdviceItems),
    ...normalizeTextList(outcome?.todayActions),
    ...normalizeTextList(outcome?.threeDayActions),
    ...normalizeTextList(outcome?.sevenDayObserve),
    ...normalizeTextList([outcome?.firstAid]),
    ...normalizeTextList([outcome?.recommendation]),
    ...normalizeTextList([outcome?.actionAdvice])
  ])
}

function buildOutcomeAvoidAdviceItems(outcome = {}) {
  return uniqueStrings([
    ...normalizeTextList(outcome?.avoidAdviceItems),
    ...normalizeTextList(outcome?.avoidActions),
    ...normalizeTextList(outcome?.retakeOrEscalate),
    ...normalizeTextList([outcome?.avoid]),
    ...normalizeTextList([outcome?.reassurance]),
    ...normalizeTextList([outcome?.preventionAdvice])
  ])
}

function getQuestionTitle(question = {}) {
  return sanitizeTemplateText(
    question?.questionTextUserCn ||
      question?.questionTextCn ||
      question?.text ||
      question?.questionText ||
      question?.title ||
      ''
  )
}

function getQuestionHelpText(question = {}) {
  return sanitizeTemplateText(
    question?.helpTextCn ||
      question?.helpText ||
      question?.questionHelpText ||
      ''
  )
}

function getOptionText(question = {}, option = {}) {
  const text = sanitizeTemplateText(
    option?.optionTextUserCn ||
      option?.optionTextCn ||
      option?.text ||
      option?.optionText ||
      option?.label ||
      option?.desc ||
      ''
  )
  const mappedText = resolveYellowingQuestionOptionText(question, option)
  return mappedText || text
}

function resolveYellowingQuestionOptionText(question = {}, option = {}) {
  if (!isYellowingQuestion(question)) {
    return ''
  }

  const optionKey = normalizeText(option?.optionKey || option?.value || option?.optionId || option?.id || '')
  const optionText = normalizeText(
    option?.optionTextUserCn ||
      option?.optionTextCn ||
      option?.text ||
      option?.optionText ||
      option?.label ||
      ''
  )
  const questionKey = normalizeText(question?.questionKey)
  const targetDimension = normalizeText(question?.targetDimension)

  if (isYellowingWateringQuestion(questionKey, targetDimension)) {
    if (isFrequencyOption(optionKey, optionText, [
      'often_wet',
      'more_wet',
      'too_wet',
      'over_wet',
      'yes'
    ])) {
      return '近2周 2 次以上'
    }
    if (isFrequencyOption(optionKey, optionText, [
      'normal_or_stable',
      'no_change',
      'normal',
      'stable'
    ])) {
      return '近2周 1-2 次'
    }
    if (isFrequencyOption(optionKey, optionText, [
      'often_dry',
      'more_dry',
      'not_enough',
      'dry',
      'lack'
    ])) {
      return '近2周 0 次'
    }
    return ''
  }

  if (isYellowingFertilizationQuestion(questionKey, targetDimension)) {
    if (isFrequencyOption(optionKey, optionText, [
      'low_or_no_fertilizer',
      'no',
      'none',
      'not_fertilized'
    ])) {
      return '近1个月 0 次'
    }
    if (isFrequencyOption(optionKey, optionText, [
      'normal_light_fertilizer',
      'normal',
      'appropriate'
    ])) {
      return '近1个月 1-2 次'
    }
    if (isFrequencyOption(optionKey, optionText, [
      'recent_heavy_fertilizer_or_repot',
      'heavy_fertilizer',
      'heavy',
      'repot',
      'fertilize'
    ])) {
      return '近1个月 2 次以上'
    }
    return ''
  }

  return ''
}

function getOptionDescription(option = {}) {
  return sanitizeTemplateText(
    option?.optionDescriptionUserCn ||
      option?.descriptionCn ||
      option?.optionDescription ||
      option?.description ||
      option?.desc ||
      ''
  )
}

function isYellowingQuestion(question = {}) {
  const questionKey = normalizeText(question?.questionKey)
  const questionText = normalizeText(
    question?.questionTextCn ||
      question?.questionTextUserCn ||
      question?.questionText ||
      ''
  )
  return questionKey.includes('yellowing') || questionText.includes('黄叶')
}

function isYellowingWateringQuestion(questionKey = '', targetDimension = '') {
  return questionKey.includes('watering_frequency_context') ||
    questionKey.includes('watering_context') ||
    questionKey.includes('watering') ||
    targetDimension.includes('watering')
}

function isYellowingFertilizationQuestion(questionKey = '', targetDimension = '') {
  return questionKey.includes('fertilization_growth_context') ||
    questionKey.includes('fertilization_context') ||
    questionKey.includes('fertilization_reference') ||
    questionKey.includes('fertilization') ||
    targetDimension.includes('fertilization')
}

function isFrequencyOption(optionKey = '', optionText = '', optionKeys = []) {
  if (optionKeys.includes(optionKey)) {
    return true
  }

  if (!optionText) {
    return false
  }

  const compactText = normalizeText(optionText).replace(/\s+/g, '')
  return optionKeys.some(item => compactText.includes(item.replaceAll('_', '')))
}

function getQuestionId(question) {
  return String(question?.questionId || '').trim()
}

function findQuestionById(questionId = '') {
  const normalizedQuestionId = String(questionId || '').trim()
  if (!normalizedQuestionId) {return null}
  return questionStack.value.find(item => getQuestionId(item) === normalizedQuestionId) || null
}

function getCareBehaviorTimelineByQuestion(question = {}) {
  const questionId = getQuestionId(question)
  const fallbackTimeline = mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(
    extractCareBehaviorTimelineFromQuestion(question),
    environmentWeatherWindow.value
  )
  if (!questionId) {
    return fallbackTimeline
  }
  return careBehaviorTimelineByQuestionId.value[questionId] || fallbackTimeline
}

function buildCareBehaviorTimelineByQuestionIdMap(questions = []) {
  return (Array.isArray(questions) ? questions : [])
    .filter(item => isCareBehaviorWateringTimelineQuestion(item))
    .reduce((acc, item) => {
      const questionId = getQuestionId(item)
      if (!questionId) {return acc}
      const sourceTimeline = careBehaviorTimelineByQuestionId.value?.[questionId] ||
        extractCareBehaviorTimelineFromQuestion(item)
      acc[questionId] = mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(
        sourceTimeline,
        environmentWeatherWindow.value
      )
      return acc
    }, {})
}

function handleCareBehaviorTimelineChange(question, timeline = null) {
  const questionId = getQuestionId(question)
  if (!questionId) {return}
  const currentTimeline = careBehaviorTimelineByQuestionId.value?.[questionId] || {}
  const nextTimeline = mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(
    timeline || {},
    environmentWeatherWindow.value
  )
  if (getCareBehaviorTimelineChangeSignature(currentTimeline) === getCareBehaviorTimelineChangeSignature(nextTimeline)) {
    syncCareBehaviorTimelineAnswer(question, Object.keys(currentTimeline).length ? currentTimeline : nextTimeline)
    return
  }
  careBehaviorTimelineByQuestionId.value = {
    ...careBehaviorTimelineByQuestionId.value,
    [questionId]: nextTimeline
  }
  syncCareBehaviorTimelineAnswer(question, nextTimeline)
}

function getCareBehaviorTimelineChangeSignature(timeline = null) {
  const normalized = normalizeCareBehaviorTimeline(timeline || {})
  return JSON.stringify({
    reference_date: normalized.reference_date || '',
    watering_events_10d: normalized.watering_events_10d || [],
    fertilizing_events_10d: normalized.fertilizing_events_10d || [],
    light_change_events_10d: normalized.light_change_events_10d || [],
    last_fertilized_bucket: normalized.last_fertilized_bucket || 'unknown'
  })
}

function resolveCareBehaviorReferenceDate(questions = []) {
  const candidates = Array.isArray(questions) ? questions : []
  for (const question of candidates) {
    const timeline = extractCareBehaviorTimelineFromQuestion(question)
    const referenceDate =
      question?.referenceDate ||
      question?.reference_date ||
      question?.payload?.referenceDate ||
      question?.payload?.reference_date ||
      timeline?.reference_date ||
      timeline?.referenceDate
    if (referenceDate) {
      return String(referenceDate).slice(0, 10)
    }
  }
  return new Date().toISOString().slice(0, 10)
}

function resolveCareBehaviorWeatherLocation() {
  const location = userStore.location || {}
  const lat = Number(location.latitude ?? location.lat)
  const lng = Number(location.longitude ?? location.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return null
  }
  return {
    lat,
    lng,
    city: String(location.city || '').trim(),
    province: String(location.province || '').trim()
  }
}

function applyEnvironmentWeatherWindowToCareBehaviorTimelines() {
  if (!environmentWeatherWindow.value) {return}
  careBehaviorTimelineByQuestionId.value = Object.fromEntries(
    Object.entries(careBehaviorTimelineByQuestionId.value || {}).map(([questionId, timeline]) => [
      questionId,
      mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(timeline, environmentWeatherWindow.value)
    ])
  )
}

async function refreshEnvironmentWeatherWindowForCareBehavior(questions = questionStack.value) {
  try {
    const timelineQuestions = (Array.isArray(questions) ? questions : [])
      .filter(item => isCareBehaviorWateringTimelineQuestion(item))
    if (!timelineQuestions.length || environmentWeatherWindowLoading.value) {return}

    const location = resolveCareBehaviorWeatherLocation()
    if (!location) {return}

    const diagnosisDate = resolveCareBehaviorReferenceDate(timelineQuestions)
    const requestKey = [
      location.lat.toFixed(5),
      location.lng.toFixed(5),
      location.city,
      location.province,
      diagnosisDate
    ].join('|')
    if (requestKey === environmentWeatherWindowRequestKey.value && environmentWeatherWindow.value) {
      applyEnvironmentWeatherWindowToCareBehaviorTimelines()
      return
    }

    environmentWeatherWindowLoading.value = true
    const weatherWindow = await getEnvironmentWeatherWindow({
      ...location,
      diagnosisDate,
      mode: 'diagnosis'
    })
    if (weatherWindow) {
      environmentWeatherWindow.value = weatherWindow
      environmentWeatherWindowRequestKey.value = requestKey
      applyEnvironmentWeatherWindowToCareBehaviorTimelines()
    }
  } catch (error) {
    console.warn('获取养护时间线环境天气失败:', error)
  } finally {
    if (environmentWeatherWindowLoading.value) {
      environmentWeatherWindowLoading.value = false
    }
  }
}

function syncCareBehaviorTimelineAnswer(question, timeline = null) {
  const questionId = getQuestionId(question)
  if (!questionId) {return}

  const currentOptionId = String(questionAnswers.value[questionId] || '').trim()
  const recordedOptionId = resolveCareBehaviorTimelineRecordedAnswerOptionId(question)
  const meaningfulTimeline = hasMeaningfulCareBehaviorTimeline(timeline)
  const visibleOptions = getVisibleCareBehaviorOptions(question)
  const nextAnswerId = meaningfulTimeline
    ? (isLegacyWateringTimelineQuestion(question) ? 'care_behavior_timeline' : recordedOptionId)
    : ''

  if (nextAnswerId) {
    if (currentOptionId !== nextAnswerId) {
      setQuestionAnswer(questionId, nextAnswerId)
    }
    return
  }

  if (!meaningfulTimeline && visibleOptions.some(option => String(option?.optionId || '').trim() === currentOptionId)) {
    return
  }

  if (currentOptionId) {
    setQuestionAnswer(questionId, '')
  }
}

function getQuestionOptionId(option) {
  return String(option?.optionId || '').trim()
}

function getExpandedQuestionOptionId(question) {
  const questionId = getQuestionId(question)
  if (!questionId) {return ''}
  return String(
    expandedQuestionOptionByQuestion.value[questionId] ||
    questionAnswers.value[questionId] ||
    question?.defaultOptionId ||
    ''
  ).trim()
}

function normalizeCollapseOptionValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return normalizeCollapseOptionValue(value.detail?.value ?? value.detail ?? value.value ?? '')
  }
  if (Array.isArray(value)) {
    return String(value[0] || '').trim()
  }
  return String(value || '').trim()
}

function setExpandedQuestionOption(question, optionId) {
  const questionId = getQuestionId(question)
  const normalizedOptionId = String(optionId || '').trim()
  if (!questionId || !normalizedOptionId) {return}
  expandedQuestionOptionByQuestion.value = {
    ...expandedQuestionOptionByQuestion.value,
    [questionId]: normalizedOptionId
  }
}

function handleQuestionAccordionChange(question, value) {
  const optionId = normalizeCollapseOptionValue(value)
  if (!optionId) {return}
  setExpandedQuestionOption(question, optionId)
  setQuestionAnswer(getQuestionId(question), optionId)
}

function isQuestionOptionExpanded(question, option) {
  if (!isAccordionQuestion(question)) {return true}
  const optionId = getQuestionOptionId(option)
  return Boolean(optionId && getExpandedQuestionOptionId(question) === optionId)
}

function isSelectedQuestionOption(question, option) {
  const questionId = getQuestionId(question)
  const optionId = getQuestionOptionId(option)
  if (!questionId || !optionId) {return false}
  const selectedOptionId = String(
    questionAnswers.value[questionId] ||
    question?.defaultOptionId ||
    ''
  ).trim()
  return selectedOptionId === optionId
}

function selectQuestionOption(question, option) {
  const questionId = getQuestionId(question)
  const optionId = getQuestionOptionId(option)
  if (!questionId || !optionId) {return}
  setQuestionAnswer(questionId, optionId)
  if (isAccordionQuestion(question)) {
    setExpandedQuestionOption(question, optionId)
  }
}

function findQuestionIndex(questionId = '') {
  const normalizedQuestionId = String(questionId || '').trim()
  if (!normalizedQuestionId) {return -1}
  return questionStack.value.findIndex(item => getQuestionId(item) === normalizedQuestionId)
}

function updateDirtyQuestionIndex(questionId = '', optionId = '') {
  const questionIndex = findQuestionIndex(questionId)
  if (questionIndex < 0) {return}

  const committedOptionId = String(
    committedQuestionAnswers.value?.[questionId]?.optionId || ''
  ).trim()
  const isHistoricalQuestion = questionIndex < questionStack.value.length - 1

  if (committedOptionId && committedOptionId === String(optionId || '').trim()) {
    return
  }

  if (!committedOptionId && !isHistoricalQuestion) {
    return
  }

  dirtyQuestionFromIndex.value =
    dirtyQuestionFromIndex.value >= 0
      ? Math.min(dirtyQuestionFromIndex.value, questionIndex)
      : questionIndex
}

function goPreviousQuestion() {
  activeQuestionIndex.value = Math.max(0, activeQuestionIndex.value - 1)
}

function goNextQuestion() {
  if (hasDirtyQuestionAnswers.value && activeQuestionIndex.value >= dirtyQuestionFromIndex.value) {
    return
  }
  activeQuestionIndex.value = Math.min(
    Math.max(questionStack.value.length - 1, 0),
    activeQuestionIndex.value + 1
  )
}

function canProceedQuestion() {
  const question = currentQuestion.value
  const questionId = getQuestionId(question)
  if (!questionId) {return false}
  if (isSubmittingQuestionFlow.value) {return false}
  if (additionalImageFiles.value.length > 0 || hasPendingAdditionalImageUploads.value || hasAdditionalImageUploadErrors.value) {
    return false
  }
  return Boolean(questionAnswers.value[questionId])
}

async function handleNextQuestion() {
  if (!canProceedQuestion()) {
    return
  }

  if (!hasDirtyQuestionAnswers.value && activeQuestionIndex.value < questionStack.value.length - 1) {
    goNextQuestion()
    return
  }

  await submitQuestionAnswers()
}

function resetQuestionState(questions = [], { answerRevision = 0 } = {}) {
  const nextQuestions = Array.isArray(questions) ? questions.filter(item => item?.questionId) : []
  questionStack.value = nextQuestions
  activeQuestionIndex.value = 0
  questionAnswers.value = createQuestionAnswerMap(nextQuestions)
  careBehaviorTimelineByQuestionId.value = buildCareBehaviorTimelineByQuestionIdMap(nextQuestions)
  committedQuestionAnswers.value = {}
  dirtyQuestionFromIndex.value = -1
  questionAnswerRevision.value = Number(answerRevision || 0)
  expandedQuestionOptionByQuestion.value = {}
  refreshEnvironmentWeatherWindowForCareBehavior(nextQuestions)
}

function mergeQuestionState(nextResult = null, submittedPayload = null) {
  const nextQuestions = Array.isArray(nextResult?.questions)
    ? nextResult.questions.filter(item => item?.questionId)
    : []
  const submittedAnswers = Array.isArray(submittedPayload?.answers) ? submittedPayload.answers : []
  const submittedAnswerMap = submittedAnswers.reduce((entries, item) => {
    const questionId = String(item?.questionId || '').trim()
    const optionId = String(item?.optionId || '').trim()
    if (questionId && optionId) {
      entries[questionId] = {
        optionId,
        answerRevision: Number(nextResult?.answerRevision || submittedPayload?.baseAnswerRevision || 0)
      }
    }
    return entries
  }, {})

  const dirtyIndex = dirtyQuestionFromIndex.value
  const patchKeepUntilQuestionId = String(nextResult?.uiPatch?.keepUntilQuestionId || '').trim()
  const patchKeepIndex = patchKeepUntilQuestionId
    ? findQuestionIndex(patchKeepUntilQuestionId)
    : -1
  const keepEndIndex =
    patchKeepIndex >= 0
      ? patchKeepIndex
      : dirtyIndex >= 0
        ? dirtyIndex
        : questionStack.value.length - 1
  const keptQuestions = questionStack.value.slice(0, Math.max(0, keepEndIndex + 1))
  const keptQuestionIds = new Set(keptQuestions.map(item => getQuestionId(item)).filter(Boolean))
  const appendQuestions = nextQuestions.filter(item => !keptQuestionIds.has(getQuestionId(item)))
  const nextStack = nextResult?.hasActiveQuestions ? [...keptQuestions, ...appendQuestions] : []
  const nextStackQuestionIds = new Set(nextStack.map(item => getQuestionId(item)).filter(Boolean))

  questionStack.value = nextStack
  questionAnswers.value = {
    ...Object.fromEntries(
      Object.entries(questionAnswers.value || {}).filter(([questionId]) =>
        nextStackQuestionIds.has(questionId)
      )
    ),
    ...createQuestionAnswerMap(appendQuestions)
  }
  careBehaviorTimelineByQuestionId.value = {
    ...Object.fromEntries(
      Object.entries(careBehaviorTimelineByQuestionId.value || {}).filter(([questionId]) =>
        nextStackQuestionIds.has(questionId)
      )
    ),
    ...buildCareBehaviorTimelineByQuestionIdMap(nextStack)
  }
  committedQuestionAnswers.value = {
    ...Object.fromEntries(
      Object.entries(committedQuestionAnswers.value || {}).filter(([questionId]) =>
        nextStackQuestionIds.has(questionId)
      )
    ),
    ...Object.fromEntries(
      Object.entries(submittedAnswerMap).filter(([questionId]) => nextStackQuestionIds.has(questionId))
    )
  }
  dirtyQuestionFromIndex.value = -1
  questionAnswerRevision.value = Number(nextResult?.answerRevision || questionAnswerRevision.value || 0)
  activeQuestionIndex.value = nextStack.length ? nextStack.length - 1 : 0
  expandedQuestionOptionByQuestion.value = {}
  refreshEnvironmentWeatherWindowForCareBehavior(nextStack)
}

onMounted(() => {
  refreshViewportHeight()
})

watch(
  () => [
    userStore.location?.latitude,
    userStore.location?.longitude,
    userStore.location?.city,
    userStore.location?.province,
    questionStack.value.map(item => getQuestionId(item)).join('|')
  ],
  () => {
    refreshEnvironmentWeatherWindowForCareBehavior()
  }
)

function open() {
  refreshViewportHeight()
  popup.value?.open()
}

function close() {
  popup.value?.close()
}

function handleChange(e) {
  if (!e.show) {
    emit('close')
  }
}

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(item => String(item || '').trim())
        .filter(Boolean)
    )
  )
}

function selectDevSymptomClass(classKey = '') {
  selectedDevSymptomClassKey.value = String(classKey || '').trim()
}

function clearDevSymptomClass() {
  selectedDevSymptomClassKey.value = ''
}

function isQuestionStartSubmitting() {
  return Boolean(questionStartMutation.isPending?.value || questionStartMutation.isLoading?.value)
}

async function handleSymptomClassQuickSelect(option = null) {
  selectDevSymptomClass(option?.classKey || '')
  if (imageFiles.value.length || primaryStructuredImages.value.length) {
    return
  }

  await startQuestionDiagnosisFromSymptomClass()
}

async function startQuestionDiagnosisFromSymptomClass() {
  const option = selectedDevSymptomClassOption.value
  if (!option) {
    uni.showToast({ title: '请选择症状模式', icon: 'none' })
    return
  }

  if (isQuestionStartSubmitting()) {
    return
  }

  if (hasPendingUploads.value) {
    uni.showToast({ title: '请等待图片上传完成', icon: 'none' })
    return
  }

  if (hasUploadErrors.value) {
    uni.showToast({ title: '请先删除上传失败的图片', icon: 'none' })
    return
  }

  if (!userStore.canDiagnose) {
    uni.showModal({
      title: '提示',
      content: '免费诊断次数已用完，升级会员享受无限次诊断',
      confirmText: '升级会员',
      success: res => {
        if (res.confirm) {
          close()
          uni.switchTab({ url: '/pages/profile/profile' })
        }
      }
    })
    return
  }

  uni.showLoading({ title: '正在生成问诊...' })
  try {
    await questionStartMutation.mutateAsync({
      plantId: props.plantId,
      userPlantId: props.plantId,
      plantName: props.plantName,
      symptomClassKey: option.classKey,
      symptomKey: option.symptomKey,
      description: `无图症状模式：${option.symptomCn}（${option.classNameCn}）`,
      onFinish: diagnosisResult => {
        userStore.useAIQuota()
        navigateToDiagnosisQuestionPackagePage(diagnosisResult)
      }
    })
  } catch (error) {
    uni.showToast({ title: error?.message || '问诊初始化失败，请重试', icon: 'none' })
  } finally {
    uni.hideLoading()
  }
}

function buildStructuredImageInputs(files = []) {
  return (Array.isArray(files) ? files : [])
    .filter(item => item?.status === 'success')
    .map((item, index) => {
      const imageRef = String(item?.uploaded?.tempUrl || item?.uploaded?.url || '').trim()
      if (!imageRef) {
        return null
      }

      const slotType = normalizeSlotType(item?.inputSlotType || item?.userDeclaredOrganType || '', 'unknown')
      const metadata = buildSlotMetadata(slotType, index)
      const uploadCompression = buildUploadCompressionTrace(item)
      const declaredConfidence =
        item?.userDeclaredOrganConfidence === null ||
        item?.userDeclaredOrganConfidence === undefined ||
        item?.userDeclaredOrganConfidence === ''
          ? metadata.userDeclaredOrganConfidence
          : Number(item.userDeclaredOrganConfidence)

      return {
        imageRef,
        inputSlotType: slotType,
        orderIndex: index,
        inputSlotOrder: index,
        inputSlotLabel: metadata.inputSlotLabel,
        userDeclaredOrganType: String(
          item?.userDeclaredOrganType || metadata.userDeclaredOrganType || ''
        ).trim(),
        userDeclaredOrganConfidence:
          declaredConfidence === null || declaredConfidence === undefined || Number.isNaN(declaredConfidence)
            ? null
            : Number(declaredConfidence),
        ...(uploadCompression ? { uploadCompression } : {}),
        ...(item?.uploaded?.fileId ? { fileId: item.uploaded.fileId } : {})
      }
    })
    .filter(Boolean)
}

function normalizePositiveNumber(value) {
  const normalized = Number(value)
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0
}

function buildUploadCompressionTrace(item = {}) {
  const compression = item?.compressed || null
  if (!compression || typeof compression !== 'object') {
    return null
  }

  const originalSizeBytes = normalizePositiveNumber(compression.originalSize || item?.size)
  const uploadedSizeBytes = normalizePositiveNumber(compression.fileSize)
  const quality = normalizePositiveNumber(compression.quality)
  const width = normalizePositiveNumber(compression.width)
  const height = normalizePositiveNumber(compression.height)
  const targetSizeBytes = normalizePositiveNumber(compression.targetBytes)
  const minimumQuality = normalizePositiveNumber(compression.minimumQuality)

  return {
    source: 'client_upload_before_cloud_storage',
    compressed: Boolean(compression.compressed),
    originalSizeBytes,
    uploadedSizeBytes,
    compressionRatio:
      originalSizeBytes > 0 && uploadedSizeBytes > 0
        ? Math.round((uploadedSizeBytes / originalSizeBytes) * 1000) / 1000
        : null,
    quality: quality || null,
    width: width || null,
    height: height || null,
    targetSizeBytes: targetSizeBytes || null,
    minimumQuality: minimumQuality || null,
    preserveImageDetails: Boolean(compression.preserveImageDetails),
    doubleConfirmedForHunyuan: Boolean(item?.uploaded?.tempUrl || item?.uploaded?.url)
  }
}

function getPreviewImagesFromFiles(files = []) {
  return uniqueStrings(
    (Array.isArray(files) ? files : []).map(item => item?.previewUrl)
  )
}

function getCasePreviewImages({ includeAdditionalImages = false } = {}) {
  const baseImages = casePreviewImages.value.length
    ? casePreviewImages.value
    : getPreviewImagesFromFiles(imageFiles.value)

  if (!includeAdditionalImages) {
    return uniqueStrings(baseImages)
  }

  return uniqueStrings([...baseImages, ...getPreviewImagesFromFiles(additionalImageFiles.value)])
}

function detectUsedAdditionalImageSubmission(currentResult = null) {
  const trace = currentResult?.visualBatchTrace
  if (!trace || typeof trace !== 'object') {
    return false
  }

  const currentBatchId = String(trace?.currentVisualCallBatchId || trace?.current_visual_call_batch_id || '').trim()
  const originBatchId = String(trace?.originVisualCallBatchId || trace?.origin_visual_call_batch_id || '').trim()
  const supersedeApplied = Number(trace?.supersedeApplied ?? trace?.supersede_applied ?? 0) === 1

  return supersedeApplied || Boolean(currentBatchId && originBatchId && currentBatchId !== originBatchId)
}

async function chooseImage(slotType = 'other') {
  const normalizedSlotType = normalizeSlotType(slotType, 'other')
  const slotLimit = getSlotCapacity(PRIMARY_IMAGE_LIMIT)
  if (imageFiles.value.length >= PRIMARY_IMAGE_LIMIT) {
    uni.showToast({ title: `最多上传 ${PRIMARY_IMAGE_LIMIT} 张`, icon: 'none' })
    return
  }
  if (getSlotFileCount(imageFiles.value, normalizedSlotType) >= slotLimit) {
    uni.showToast({
      title: `${getOrganOptionLabel(normalizedSlotType)}最多 ${slotLimit} 张`,
      icon: 'none'
    })
    return
  }

  try {
    await uploader.chooseAndUpload({
      plantId: props.plantId,
      maxAge: 7200,
      pickCount: 1,
      entryPatch: buildSlotMetadata(normalizedSlotType, imageFiles.value.length)
    })
  } catch (error) {
    const message = String(error?.errMsg || error?.message || '')
    if (message.includes('cancel')) {
      return
    }

    console.error('选择图片失败:', error)
    uni.showToast({
      title: '选择图片失败，请重试',
      icon: 'none'
    })
  }
}

async function chooseAdditionalImage(slotType = 'whole_plant') {
  const normalizedSlotType = normalizeSlotType(slotType, 'whole_plant')
  const slotLimit = getSlotCapacity(ADDITIONAL_IMAGE_LIMIT)
  if (additionalImageFiles.value.length >= ADDITIONAL_IMAGE_LIMIT) {
    uni.showToast({ title: `最多补 ${ADDITIONAL_IMAGE_LIMIT} 张`, icon: 'none' })
    return
  }
  if (getSlotFileCount(additionalImageFiles.value, normalizedSlotType) >= slotLimit) {
    uni.showToast({
      title: `${getOrganOptionLabel(normalizedSlotType)}最多 ${slotLimit} 张`,
      icon: 'none'
    })
    return
  }

  try {
    await additionalImageUploader.chooseAndUpload({
      plantId: props.plantId,
      maxAge: 7200,
      pickCount: 1,
      entryPatch: buildSlotMetadata(normalizedSlotType, additionalImageFiles.value.length)
    })
  } catch (error) {
    const message = String(error?.errMsg || error?.message || '')
    if (message.includes('cancel')) {
      return
    }

    console.error('选择补图失败:', error)
    uni.showToast({
      title: '选择补图失败，请重试',
      icon: 'none'
    })
  }
}

function removeImage(index) {
  uploader.removeAt(index)
}

function removeAdditionalImage(index) {
  additionalImageUploader.removeAt(index)
}

async function resetAdditionalImages() {
  await additionalImageUploader.reset()
}

async function startDiagnose() {
  const propObservedSymptoms = Array.isArray(props.observedSymptoms) ? props.observedSymptoms : []
  const effectiveObservedSymptoms = propObservedSymptoms
  const effectiveObservedEvidenceSet = []
  const hasObservedSymptoms = effectiveObservedSymptoms.length > 0
  const structuredImages = primaryStructuredImages.value
  const uploadedImageUrls = structuredImages.map(item => item.imageRef)

  if (imageFiles.value.length === 0 && !uploadedImageUrls.length && hasSelectedSymptomMode.value) {
    await startQuestionDiagnosisFromSymptomClass()
    return
  }

  if (imageFiles.value.length === 0 && !hasObservedSymptoms) {
    uni.showToast({ title: '请先添加照片', icon: 'none' })
    return
  }

  if (hasPendingUploads.value) {
    uni.showToast({ title: '请等待图片上传完成', icon: 'none' })
    return
  }

  if (hasUploadErrors.value) {
    uni.showToast({ title: '请先删除上传失败的图片', icon: 'none' })
    return
  }

  if (uploadedImageUrls.length === 0 && !hasObservedSymptoms) {
    uni.showToast({ title: '请至少保留 1 张上传成功的图片', icon: 'none' })
    return
  }

  if (!userStore.canDiagnose) {
    uni.showModal({
      title: '提示',
      content: '免费诊断次数已用完，升级会员享受无限次诊断',
      confirmText: '升级会员',
      success: res => {
        if (res.confirm) {
          close()
          uni.switchTab({ url: '/pages/profile/profile' })
        }
      }
    })
    return
  }

  try {
    const imageUrls = hasObservedSymptoms ? [] : uploadedImageUrls

    const diagnosePayload = {
      image: imageUrls[0] || '',
      images: hasObservedSymptoms ? [] : structuredImages,
      imageIds: imageUrls,
      plantId: props.plantId,
      plantName: props.plantName,
      observedSymptoms: hasObservedSymptoms ? effectiveObservedSymptoms : [],
      observedEvidenceSet: effectiveObservedEvidenceSet,
      description: `共上传 ${imageUrls.length} 张照片`
    }

    pendingDiagnosePayload.value = diagnosePayload
    showAIDialog.value = true
    await new Promise(resolve => setTimeout(resolve, 100))
    aiStreamDialogRef.value?.startStream()

    await diagnoseMutation.mutateAsync({
      ...diagnosePayload,
      onText: (text, fullText) => {
        aiStreamDialogRef.value?.setText(fullText)
      },
      onFinish: diagnosisResult => {
        aiStreamDialogRef.value?.finishStream(diagnosisResult)
        userStore.useAIQuota()
      },
      onError: error => {
        aiStreamDialogRef.value?.setError(error)
      }
    })
  } catch (error) {
    console.error('诊断失败:', error)
    uni.hideLoading()
    uni.showToast({ title: error?.message || '诊断失败，请重试', icon: 'none' })
  }
}

function handleAIDialogClose() {
  showAIDialog.value = false
}

function buildDiagnosisQuestionPackageStorageKey(diagnosisSessionId = '') {
  return `${DIAGNOSIS_QUESTION_PACKAGE_STORAGE_KEY_PREFIX}${diagnosisSessionId || Date.now()}`
}

function navigateToDiagnosisQuestionPackagePage(diagnosisResult) {
  const previewImages = getCasePreviewImages({ includeAdditionalImages: false })
  const normalizedResult = normalizeDiagnosisResult(diagnosisResult, {
    images: previewImages,
    plantName: props.plantName || '植物'
  })
  const storageKey = buildDiagnosisQuestionPackageStorageKey(normalizedResult.diagnosisSessionId)

  uni.setStorageSync(storageKey, {
    plantId: props.plantId,
    plantName: props.plantName || '植物',
    images: previewImages,
    diagnosisResult,
    normalizedResult,
    createdAt: Date.now()
  })

  showAIDialog.value = false
  pendingDiagnosePayload.value = null
  close()
  uni.navigateTo({
    url: `/pages/diagnose/question-package?draftKey=${encodeURIComponent(storageKey)}`
  })
}

function handleAIDialogCancel() {
  showAIDialog.value = false
  pendingDiagnosePayload.value = null
  close()
}

function handleAIDialogConfirm(diagnosisResult) {
  if (diagnosisResult) {
    navigateToDiagnosisQuestionPackagePage(diagnosisResult)
    return
  }
  showAIDialog.value = false
}

function handleAIRetry() {
  if (pendingDiagnosePayload.value) {
    aiStreamDialogRef.value?.startStream()

    const callbackOpts = {
      ...pendingDiagnosePayload.value,
      onText: (text, fullText) => {
        aiStreamDialogRef.value?.setText(fullText)
      },
      onFinish: diagnosisResult => {
        aiStreamDialogRef.value?.finishStream(diagnosisResult)
      },
      onError: error => {
        aiStreamDialogRef.value?.setError(error)
      }
    }

    diagnoseMutation.mutateAsync(callbackOpts)
  }
}

function setQuestionAnswer(questionId, answerValue) {
  updateDirtyQuestionIndex(questionId, answerValue)
  questionAnswers.value = {
    ...questionAnswers.value,
    [questionId]: answerValue
  }

  const question = findQuestionById(questionId)
  if (!question || !isCareBehaviorWateringTimelineQuestion(question)) {
    return
  }

  const answerId = String(answerValue || '').trim()
  const autoAnswerId = resolveCareBehaviorTimelineAutoAnswerOptionId(question)
  if (isCareBehaviorTimelineSentinelAnswer(question, answerId) || answerId === autoAnswerId) {
    return
  }
  careBehaviorTimelineByQuestionId.value = {
    ...careBehaviorTimelineByQuestionId.value,
    [questionId]: {}
  }
}

function canStartDiagnose() {
  const hasObservedSymptoms =
    hasSelectedSymptomMode.value ||
    (Array.isArray(props.observedSymptoms) && props.observedSymptoms.length > 0)

  if (isQuestionStartSubmitting()) {
    return false
  }

  if (!hasObservedSymptoms && primaryStructuredImages.value.length === 0) {
    return false
  }

  if (hasUploadErrors.value) {
    return false
  }

  return !hasPendingUploads.value
}

function canSubmitQuestionAnswers() {
  if (additionalImageFiles.value.length > 0 || hasPendingAdditionalImageUploads.value || hasAdditionalImageUploadErrors.value) {
    return false
  }

  if (!hasDirtyQuestionAnswers.value && activeQuestionIndex.value < questionStack.value.length - 1) {
    return false
  }

  return isQuestionAnswerComplete(
    questionStack.value.slice(0, activeQuestionIndex.value + 1),
    questionAnswers.value
  )
}

function canSubmitAdditionalImages() {
  if (!canShowAdditionalImageUploader.value) {
    return false
  }

  if (hasUsedAdditionalImageSubmission.value) {
    return false
  }

  if (hasPendingAdditionalImageUploads.value || hasAdditionalImageUploadErrors.value) {
    return false
  }

  return additionalStructuredImages.value.length > 0
}

async function submitQuestionAnswers() {
  if (!result.value || !canSubmitQuestionAnswers()) {
    return
  }

  submittingQuestionMode.value = 'answers'
  try {
    const isRevisionSubmit = hasDirtyQuestionAnswers.value
    const submitQuestionStack = isRevisionSubmit
      ? questionStack.value.slice(0, activeQuestionIndex.value + 1)
      : currentQuestion.value
        ? [currentQuestion.value]
        : []
    const payload = buildQuestionAnswerPayload(result.value, questionAnswers.value, {
      questionStack: submitQuestionStack,
      requestMode: isRevisionSubmit ? 'answer_revision' : 'answer_submit',
      baseAnswerRevision: questionAnswerRevision.value,
      dirtyFromQuestionId:
        dirtyQuestionFromIndex.value >= 0
          ? getQuestionId(questionStack.value[dirtyQuestionFromIndex.value])
          : '',
      careBehaviorTimelineByQuestionId: careBehaviorTimelineByQuestionId.value,
      environmentWeatherWindow: environmentWeatherWindow.value
    })
    const rerunResult = await diagnosisAnswerMutation.mutateAsync(payload)

    const previewImages = getCasePreviewImages({ includeAdditionalImages: false })
    casePreviewImages.value = previewImages
    result.value = normalizeDiagnosisResult(rerunResult, {
      images: previewImages,
      plantName: props.plantName || result.value.plantName || '植物'
    })
    mergeQuestionState(result.value, payload)

    diagnoseStore.addToHistory({
      images: previewImages,
      diagnosis: result.value,
      diagnosisId: result.value.diagnosisSessionId || ''
    })
    emit('success', result.value)

    uni.showToast({
      title: result.value.hasActiveQuestions ? '问诊已更新' : '诊断已收敛',
      icon: 'success'
    })
  } catch (error) {
    console.error('问诊处理失败:', error)
    uni.showToast({ title: error.message || '问诊失败，请重试', icon: 'none' })
  } finally {
    submittingQuestionMode.value = ''
  }
}

async function submitAdditionalImages() {
  if (!result.value || !canSubmitAdditionalImages()) {
    return
  }

  submittingQuestionMode.value = 'images'
  try {
    const structuredImages = additionalStructuredImages.value
    const imageIds = structuredImages.map(item => item.imageRef).filter(Boolean)
    const rerunResult = await diagnosisAnswerMutation.mutateAsync({
      diagnosisSessionId: result.value.diagnosisSessionId,
      roundId: result.value.roundId,
      image: imageIds[0] || '',
      images: structuredImages,
      imageIds,
      latestVisualCallBatchId: result.value.latestVisualCallBatchId,
      visualBatchTrace: result.value.visualBatchTrace
    })

    const nextPreviewImages = getCasePreviewImages({ includeAdditionalImages: true })
    casePreviewImages.value = nextPreviewImages
    result.value = normalizeDiagnosisResult(rerunResult, {
      images: nextPreviewImages,
      plantName: props.plantName || result.value.plantName || '植物'
    })
    resetQuestionState(result.value.questions, {
      answerRevision: result.value.answerRevision
    })

    diagnoseStore.addToHistory({
      images: nextPreviewImages,
      diagnosis: result.value,
      diagnosisId: result.value.diagnosisSessionId || ''
    })
    emit('success', result.value)
    await additionalImageUploader.reset()

    uni.showToast({
      title: result.value.hasActiveQuestions ? '补图已更新' : '补图诊断已完成',
      icon: 'success'
    })
  } catch (error) {
    console.error('提交补图失败:', error)
    uni.showToast({ title: error.message || '补图失败，请重试', icon: 'none' })
  } finally {
    submittingQuestionMode.value = ''
  }
}

async function resetDiagnose() {
  await Promise.all([uploader.reset(), additionalImageUploader.reset()])
  result.value = null
  pendingDiagnosePayload.value = null
  casePreviewImages.value = []
  questionAnswers.value = {}
  careBehaviorTimelineByQuestionId.value = {}
  questionStack.value = []
  activeQuestionIndex.value = 0
  committedQuestionAnswers.value = {}
  dirtyQuestionFromIndex.value = -1
  questionAnswerRevision.value = 0
  expandedQuestionOptionByQuestion.value = {}
  submittingQuestionMode.value = ''
  selectedDevSymptomClassKey.value = ''
}

function parseAutomationDiagnosePayload(rawInput = {}) {
  if (typeof rawInput !== 'string') {
    return rawInput && typeof rawInput === 'object' ? rawInput : {}
  }

  const trimmed = rawInput.trim()
  if (!trimmed) {
    return {}
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return { imageRef: trimmed }
  }
}

function buildAutomationDiagnoseImageEntry(rawInput = {}, index = 0) {
  const item = parseAutomationDiagnosePayload(rawInput)
  const imageRef = String(item?.imageRef || item?.imageUrl || item?.url || item?.image || '').trim()

  if (!imageRef) {
    return null
  }

  const slotType = normalizeSlotType(
    item?.inputSlotType || item?.slotType || item?.userDeclaredOrganType || 'leaf',
    'leaf'
  )
  const slotMetadata = buildSlotMetadata(slotType, index)
  const uploadedSizeBytes = Number(item?.uploadedSizeBytes || item?.size || 0)
  const originalSizeBytes = Number(item?.originalSizeBytes || item?.size || 0)

  return {
    id: `automation_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
    localPath: imageRef,
    previewUrl: imageRef,
    ext: String(item?.ext || item?.suffix || 'jpg').replace(/^\./, '') || 'jpg',
    size: Number.isFinite(originalSizeBytes) && originalSizeBytes > 0 ? originalSizeBytes : 0,
    status: 'success',
    loading: false,
    error: '',
    uploaded: {
      tempUrl: imageRef,
      url: imageRef,
      fileId: String(item?.fileId || imageRef)
    },
    compressed: {
      originalSize: Number.isFinite(originalSizeBytes) && originalSizeBytes > 0 ? originalSizeBytes : 0,
      fileSize: Number.isFinite(uploadedSizeBytes) && uploadedSizeBytes > 0 ? uploadedSizeBytes : 0,
      compressed: Boolean(item?.compressed),
      quality: Number(item?.quality || 100),
      width: Number(item?.width || 0),
      height: Number(item?.height || 0),
      targetBytes: Number(item?.targetSizeBytes || 0),
      minimumQuality: Number(item?.minimumQuality || 0),
      preserveImageDetails: true
    },
    ...slotMetadata,
    orderIndex: index,
    inputSlotOrder: index
  }
}

function injectAutomationDiagnoseImages(rawInput = {}) {
  const payload = parseAutomationDiagnosePayload(rawInput)
  const rawImages = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.images)
      ? payload.images
      : [payload]
  const entries = rawImages
    .slice(0, PRIMARY_IMAGE_LIMIT)
    .map((item, index) => buildAutomationDiagnoseImageEntry(item, index))
    .filter(Boolean)

  if (!entries.length) {
    throw new Error('缺少可注入的诊断图片')
  }

  imageFiles.value.splice(0, imageFiles.value.length, ...entries)
  pendingDiagnosePayload.value = null
  result.value = null

  return {
    count: entries.length,
    images: entries.map(item => ({
      imageRef: item.uploaded?.tempUrl || item.uploaded?.url || '',
      inputSlotType: item.inputSlotType,
      inputSlotLabel: item.inputSlotLabel
    }))
  }
}

function injectAutomationDiagnoseImagesFromStorage() {
  if (!automationEnabled) {
    return { count: 0, images: [] }
  }

  const payload = uni.getStorageSync(AUTOMATION_DIAGNOSE_IMAGES_STORAGE_KEY)
  return injectAutomationDiagnoseImages(payload)
}

defineExpose({
  injectAutomationDiagnoseImages,
  open,
  close
})
</script>

<style scoped>
.dev-visual-evidence-panel {
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid #b7dcc5;
  border-radius: 16px;
  background: linear-gradient(135deg, #f3faf5 0%, #fffdf8 100%);
}

.dev-visual-evidence-tag {
  flex-shrink: 0;
  padding: 3px 7px;
  border-radius: 999px;
  background: #d8f3dc;
  color: #1f5a42;
  font-size: 10px;
  font-weight: 700;
}

.dev-visual-evidence-quick-select {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 116px;
  margin-top: 8px;
  overflow-y: auto;
}

.dev-visual-evidence-quick-option {
  padding: 5px 8px;
  border: 1px solid rgba(45, 106, 79, 0.16);
  border-radius: 999px;
  background: #ffffff;
  color: #456052;
  font-size: 10px;
  font-weight: 600;
}

.dev-visual-evidence-quick-option--active {
  border-color: #2d6a4f;
  background: #d8f3dc;
  color: #1f5a42;
}

.dev-visual-evidence-status {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(216, 243, 220, 0.62);
}

.dev-visual-evidence-clear {
  flex-shrink: 0;
  color: #8b7355;
  font-size: 10px;
  font-weight: 700;
}

.question-package-nav-row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.question-package-nav-button {
  flex: 1;
  height: 36px;
  padding: 0;
  border: 1px solid #b7dcc5;
  border-radius: 12px;
  background: #ffffff;
  color: #2d6a4f;
  font-size: 12px;
  font-weight: 700;
  line-height: 36px;
}

.question-package-nav-button--disabled {
  opacity: 0.45;
}

.popup-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.diagnose-automation-trigger {
  position: absolute;
  left: 0;
  top: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
  z-index: -1;
}

.popup-content-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.popup-scroll {
  height: 100%;
}

.popup-footer {
  flex-shrink: 0;
  padding: 12px 16px calc(env(safe-area-inset-bottom, 0px) + 12px);
  border-top: 1px solid #f1f5f9;
  background: rgba(255, 255, 255, 0.98);
}

.slot-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.slot-card {
  border-radius: 16px;
  padding: 10px;
}

.slot-thumb-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.question-package-swiper {
  width: 100%;
  height: 340px;
  overflow-x: hidden;
  overflow-y: visible;
}

.question-package-swiper-track {
  display: flex;
  height: 100%;
  min-height: 0;
  transition: transform 260ms ease;
  width: 100%;
  will-change: transform;
}

.question-package-swiper-item {
  flex: 0 0 100%;
  overflow-x: hidden;
  overflow-y: visible;
  width: 100%;
}

.question-package-question-card {
  min-height: 180px;
  border-radius: 16px;
  padding: 12px;
  background: #fff;
  border: 1px solid #d8f3dc;
  overflow: visible;
}

.question-package-question-card--animated {
  animation: question-package-card-enter 260ms ease-out both;
}

.question-package-option-stack {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
}

.question-package-option-stack--accordion {
  gap: 10px;
}

.question-package-option-collapse {
  width: 100%;
  overflow: visible;
  border-radius: 20rpx;
  background: transparent;
}

.question-package-option-collapse-item {
  margin-bottom: 16rpx;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 20rpx;
  background: #ffffff;
}

.question-package-option-accordion-title {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 22rpx 24rpx;
}

.question-package-option-accordion-title--active {
  color: #ffffff;
  background: #2d6a4f;
}

.question-package-option-accordion-title--idle {
  color: #374151;
  background: #ffffff;
}

.question-package-option-accordion-text {
  flex: 1;
  font-size: 28rpx;
  font-weight: 700;
  line-height: 1.45;
  text-align: left;
  white-space: normal;
  word-break: break-word;
}

.question-package-option-accordion-badge {
  flex-shrink: 0;
  padding: 4rpx 12rpx;
  border: 1px solid currentColor;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 700;
  line-height: 1.35;
  opacity: 0.9;
}

.question-package-option-collapse-body {
  padding: 0 24rpx 22rpx;
  background: #ffffff;
}

.question-package-option-collapse-body--active {
  background: #eaf6ef;
}

.question-package-option-button {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-start;
  margin: 0;
  min-height: 42px;
  padding: 9px 12px;
  border-radius: 14px;
  font-size: 12px;
  line-height: 1.45;
  text-align: left;
  white-space: normal;
}

.question-package-option-stack--accordion .question-package-option-button {
  min-height: 58px;
  padding: 11px 12px;
}

.question-package-option-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.question-package-option-text {
  display: block;
  width: 100%;
  font-weight: 600;
  text-align: left;
  white-space: normal;
  word-break: break-word;
}

.question-package-option-description {
  display: block;
  width: 100%;
  font-size: 10px;
  line-height: 1.45;
  text-align: left;
  white-space: pre-line;
  word-break: break-word;
  opacity: 0.82;
}

.question-package-option-stack--accordion .question-package-option-description {
  margin-top: 2px;
}

.question-package-option-button--active {
  color: #fff;
  background: #2d6a4f;
}

.question-package-option-button--idle {
  color: #374151;
  background: #fff;
  border: 1px solid #e5e7eb;
}

.whitespace-pre-line {
  white-space: pre-line;
}

.upload-spinner {
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  border: 2px solid rgba(45, 106, 79, 0.2);
  border-top-color: #2d6a4f;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes question-package-card-enter {
  from {
    opacity: 0;
    transform: translate3d(18rpx, 0, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}
.question-package-option-title-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}
</style>
