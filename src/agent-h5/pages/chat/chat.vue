<template>
  <view id="agent-chat-page" class="agent-chat-shell">
    <view class="agent-header">
      <view class="agent-header-inner">
        <view class="agent-brand">
          <view class="agent-brand-mark" aria-hidden="true">小</view>
          <view>
            <text class="agent-title">小青</text>
            <text class="agent-subtitle">青花植的植物养护助手</text>
          </view>
        </view>
        <view class="agent-connection" :class="{ 'agent-connection--offline': !ready }">
          <view class="agent-connection-dot" aria-hidden="true" />
          <text>{{ ready ? '在线' : '连接中' }}</text>
        </view>
      </view>
    </view>

    <scroll-view
      class="agent-messages"
      scroll-y
      :scroll-into-view="scrollTarget"
      scroll-with-animation
    >
      <view class="agent-message-list">
        <view v-if="!state.messages.length" class="agent-welcome-card">
          <text class="agent-welcome-title">一起照顾好你的植物</text>
          <text class="agent-welcome-copy"
            >你好，我是小青。可以和我聊聊植物的变化，或问一个养护问题。</text
          >
          <text class="agent-welcome-note"
            >具体浇水和诊断建议，请结合植物实际情况与青花植检查结果。</text
          >
        </view>

        <view
          v-for="(message, index) in state.messages"
          :id="`agent-message-${index}`"
          :key="index"
          class="agent-message-row"
          :class="
            message.role === 'user' ? 'agent-message-row--user' : 'agent-message-row--assistant'
          "
        >
          <view
            v-if="message.role === 'assistant'"
            class="agent-assistant-avatar"
            aria-hidden="true"
            >小</view
          >
          <view
            class="agent-message-content"
            :class="message.role === 'user' ? 'agent-message-user' : 'agent-message-assistant'"
          >
            <text v-if="message.role === 'user'" class="agent-message-text" selectable>{{
              message.text
            }}</text>
            <template v-else>
              <view
                v-if="isStreamingMessage(message, index) && !message.text"
                id="agent-thinking"
                class="agent-thinking"
                role="status"
                aria-live="polite"
              >
                <text class="agent-thinking-label">小青正在思考</text>
                <view class="agent-thinking-dots" aria-hidden="true">
                  <view class="agent-thinking-dot" />
                  <view class="agent-thinking-dot" />
                  <view class="agent-thinking-dot" />
                </view>
              </view>
              <view v-else-if="message.text" class="agent-answer-line">
                <rich-text
                  class="agent-markdown"
                  :nodes="renderMarkdown(message.text)"
                  selectable
                />
                <view
                  v-if="isStreamingMessage(message, index)"
                  id="agent-streaming-caret"
                  class="agent-streaming-caret"
                  aria-hidden="true"
                />
              </view>
              <text v-else class="agent-message-fallback" selectable>{{
                state.busy ? '小青正在思考…' : '本次回复已停止。'
              }}</text>
            </template>
          </view>
        </view>

        <view v-if="state.pendingQuestion" class="agent-message-row agent-message-row--assistant">
          <view class="agent-assistant-avatar" aria-hidden="true">小</view>
          <view id="agent-ask-user" class="agent-ask-card">
            <view
              v-for="(question, questionIndex) in state.pendingQuestion.questions"
              :key="`${question.question}-${questionIndex}`"
              class="agent-ask-question"
            >
              <text class="agent-ask-header">{{ question.header }}</text>
              <text class="agent-ask-title">{{ question.question }}</text>
              <view class="agent-ask-options">
                <button
                  v-for="(option, optionIndex) in question.options"
                  :id="`agent-ask-option-${questionIndex}-${optionIndex}`"
                  :key="option.label"
                  class="agent-ask-option"
                  :class="
                    question.selected.includes(option.label) ? 'agent-ask-option--selected' : ''
                  "
                  :disabled="state.busy"
                  @click="chat.selectQuestionOption(questionIndex, optionIndex)"
                >
                  <text class="agent-ask-option-label">{{ option.label }}</text>
                  <text v-if="option.description" class="agent-ask-option-description">{{
                    option.description
                  }}</text>
                </button>
              </view>
            </view>
            <button
              id="agent-ask-submit"
              class="agent-ask-submit"
              :disabled="!chat.canSubmitQuestion()"
              @click="chat.submitQuestion"
            >
              {{ state.busy ? '提交中…' : '提交回答' }}
            </button>
          </view>
        </view>

        <view id="agent-chat-bottom" />
      </view>
    </scroll-view>

    <view
      class="agent-composer-shell"
      style="padding-bottom: max(16px, env(safe-area-inset-bottom))"
    >
      <view
        v-if="state.quota?.warning || state.quotaBlocked"
        id="agent-quota-notice"
        class="agent-quota-notice"
        :class="{ 'agent-quota-notice--blocked': state.quotaBlocked }"
        role="status"
        aria-live="polite"
      >
        <text>{{ state.quota.message }}</text>
        <text v-if="state.quotaBlocked" class="agent-quota-notice-detail">
          今日已用 {{ state.quota.usedToday }} / {{ state.quota.dailyLimit }} 轮，下个配额周期自动恢复。
        </text>
      </view>
      <text
        v-if="entryError || state.error"
        id="agent-chat-error"
        class="agent-composer-message agent-composer-message--error"
        >{{ entryError || state.error }}</text
      >
      <text v-else-if="!ready" class="agent-composer-message">正在连接小青…</text>
      <text
        v-else-if="state.busy"
        class="agent-composer-message agent-composer-message--active"
        role="status"
        aria-live="polite"
        >小青正在生成回复…</text
      >
      <view class="agent-composer">
        <textarea
          id="agent-chat-input"
          v-model="draft"
          class="agent-chat-input"
          auto-height
          :maxlength="2000"
          :disabled="
            !ready || state.busy || state.expired || state.quotaBlocked || state.pendingQuestion
          "
          placeholder="说说你的植物怎么了…"
        />
        <button
          v-if="state.busy"
          id="agent-chat-stop"
          class="agent-composer-action agent-composer-action--stop"
          aria-label="停止生成"
          @click="chat.stop"
        >
          <view class="agent-stop-glyph" aria-hidden="true" />
          <text class="agent-sr-only">停止生成</text>
        </button>
        <button
          v-else
          id="agent-chat-send"
          class="agent-composer-action agent-composer-action--send"
          :disabled="
            !ready || !draft.trim() || state.expired || state.quotaBlocked || state.pendingQuestion
          "
          aria-label="发送消息"
          @click="submit"
        >
          <text class="agent-send-glyph" aria-hidden="true">↑</text>
          <text class="agent-sr-only">发送消息</text>
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { createChatState } from '../../chat-state.js'
import { renderMarkdown } from '../../markdown.js'
import { exchangeEntryTicket, sendMessage, sendToolResult } from '../../transport.js'

const chat = createChatState(sendMessage)
chat.setToolResultSender(sendToolResult)
const state = chat.state
const draft = ref('')
const ready = ref(false)
const entryError = ref('')
const scrollTarget = ref('')

function isStreamingMessage(message, index) {
  return message.role === 'assistant' && state.busy && index === state.messages.length - 1
}

onMounted(async () => {
  try {
    await exchangeEntryTicket()
    ready.value = true
  } catch {
    entryError.value = '暂时无法连接，请返回小程序重新进入小青。'
  }
})

watch(
  () => state.messages.map(message => message.text).join(''),
  async () => {
    scrollTarget.value = ''
    await nextTick()
    scrollTarget.value = 'agent-chat-bottom'
  }
)

function submit() {
  if (!ready.value || state.busy || !draft.value.trim() || state.expired || state.quotaBlocked) {
    return
  }
  const text = draft.value
  draft.value = ''
  chat.send(text)
}

onUnmounted(() => chat.stop())
</script>

<style src="./chat-layout.css"></style>
<style src="./chat-composer.css"></style>
<style src="./chat-markdown.css"></style>
