<script setup>
import { useChatStore } from '@/stores/chat'
import { storeToRefs } from 'pinia'
import { ref, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const chatStore = useChatStore()
const { messages, isLoading } = storeToRefs(chatStore)
const messagesEndRef = ref(null)

const scrollToBottom = async () => {
  await nextTick()
  if (messagesEndRef.value) {
    messagesEndRef.value.scrollIntoView({ behavior: 'smooth' })
  }
}

watch(messages, () => {
  scrollToBottom()
}, { deep: true })

watch(isLoading, () => {
  if (isLoading.value) scrollToBottom()
})

onMounted(() => {
  scrollToBottom()
})

const blurActiveElement = () => {
  const activeElement = document.activeElement
  if (activeElement && typeof activeElement.blur === 'function') {
    activeElement.blur()
  }
}

// 提交工单卡片
const submitCard = async (msg) => {
  if (msg.submitted || msg.isSubmitting) return
  blurActiveElement()
  msg.isSubmitting = true
  await nextTick()
  const success = await chatStore.executeTicketCreation(msg.cardData)
  msg.submitted = success
  msg.isSubmitting = false
}

/**
 * 将 AI 回复的文本转换为 HTML：
 * - 支持 [[工单名称|ticketId]] 语法 → 蓝色加粗可点击链接
 * - 换行符 → <br>
 * - 基础 **粗体** 支持
 */
const renderMessageContent = (content) => {
  if (!content) return ''
  let html = content
    // 转义 HTML 特殊字符（防 XSS）
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 工单链接标记：[[工单名称|ticketId]]
    .replace(/\[\[(.+?)\|(.+?)\]\]/g, (_, name, ticketId) => {
      return `<a class="ticket-link" data-ticket-id="${ticketId}">${name}</a>`
    })
    // **粗体**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // 换行
    .replace(/\n/g, '<br>')
  return html
}

// 点击工单链接
const handleContentClick = (event) => {
  const link = event.target.closest('.ticket-link')
  if (link) {
    const ticketId = link.getAttribute('data-ticket-id')
    if (ticketId) {
      router.push(`/ticket/${ticketId}`)
    }
  }
}
</script>

<template>
  <div class="message-list">
    <template v-for="msg in messages" :key="msg.id">
      <!-- 跳过 loading 占位消息（由底部独立 loading 气泡呈现） -->
      <div
        v-if="msg.type !== 'loading'"
        :class="[
          'message-item',
          msg.type,
          {
            'welcome-message': msg.type === 'system' && msg.timestamp === null,
            'card-wrapper': msg.isInfoCard || msg.isConfirmCard || msg.isSubmitSuccessCard
          }
        ]"
      >
      <div class="message-content">

        <!-- 工单信息卡片（必填未齐全，无提交按钮） -->
        <div class="order-card info-card" v-if="msg.isInfoCard">
          <div class="card-title">{{ msg.cardData.title || '创建用户报事工单：' }}</div>
          <div class="card-details">
            <div class="detail-row" v-for="(item, index) in msg.cardData.details" :key="index">
              <span class="detail-label">{{ item.label }}：</span>
              <span class="detail-value">{{ item.value }}</span>
            </div>
          </div>
          <div class="card-hint" v-if="msg.cardData.hint">{{ msg.cardData.hint }}</div>
        </div>

        <!-- 工单提交卡片（必填已齐全，有提交按钮） -->
        <div class="order-card submit-card" v-else-if="msg.isConfirmCard">
          <div class="card-title">{{ msg.cardData.title || '创建用户报事工单：' }}</div>
          <div class="card-details">
            <div class="detail-row" v-for="(item, index) in msg.cardData.details" :key="index">
              <span class="detail-label">{{ item.label }}：</span>
              <span class="detail-value">{{ item.value }}</span>
            </div>
          </div>
          <div class="card-hint" :class="{ 'warn-hint': !msg.cardData.hasPhoto }">
            {{ msg.cardData.hasPhoto
              ? '工单信息中如果有需要修改的您可以直接告诉我～'
              : '⛔️ 请尽量上传现场图片，这将大大节约维修人员诊断问题的时间！！工单信息中如果有需要修改的您可以直接告诉我～'
            }}
          </div>
          <button
            type="button"
            class="submit-ticket-btn"
            :class="{ submitting: msg.isSubmitting, done: msg.submitted }"
            :disabled="msg.submitted || msg.isSubmitting"
            @click.stop="submitCard(msg)"
            @touchend.stop.prevent="submitCard(msg)"
          >
            <span class="submit-ticket-btn-inner">
              <span v-if="msg.isSubmitting" class="submit-spinner" aria-hidden="true"></span>
              <span>{{ msg.submitted ? '✓ 已提交' : (msg.isSubmitting ? '提交中...' : '提交') }}</span>
            </span>
          </button>
        </div>

        <!-- 工单提交成功卡片 -->
        <div class="order-card submit-success-card" v-else-if="msg.isSubmitSuccessCard">
          <div class="card-title">{{ msg.cardData.title || '创建用户报事工单：' }}</div>
          <div class="card-details">
            <div class="detail-row" v-for="(item, index) in msg.cardData.details" :key="index">
              <span class="detail-label">{{ item.label }}：</span>
              <span class="detail-value">{{ item.value }}</span>
            </div>
          </div>
          <div
            class="submit-success-content rich-content"
            v-html="renderMessageContent(msg.content)"
            @click="handleContentClick"
          ></div>
        </div>

        <!-- 普通消息气泡 -->
        <div class="bubble" v-else>
          <!-- 图片消息 -->
          <div v-if="msg.imageUrl" class="image-wrapper">
            <img :src="msg.imageUrl" alt="上传图片" class="chat-image" />
            <div class="image-caption">{{ msg.content }}</div>
          </div>
          <!-- 文本消息（AI回复支持链接渲染） -->
          <template v-else>
            <div
              v-if="msg.type === 'system'"
              class="rich-content"
              v-html="renderMessageContent(msg.content)"
              @click="handleContentClick"
            ></div>
            <span v-else>{{ msg.content }}</span>
          </template>
        </div>

        <div class="timestamp" v-if="msg.timestamp && !msg.isInfoCard && !msg.isConfirmCard && !msg.isSubmitSuccessCard">
          {{ new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
        </div>
      </div>
    </div>
    </template>

    <!-- 加载中 -->
    <div v-if="isLoading" class="message-item system">
      <div class="message-content">
        <div class="bubble typing-indicator">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>
    </div>

    <div ref="messagesEndRef"></div>
  </div>
</template>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 12px 16px;
  background-color: #FFFFFF;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: 'PingFang SC', -apple-system, BlinkMacSystemFont, sans-serif;
}

.message-item {
  display: flex;
  max-width: 78%;
  align-items: flex-start;
}

.message-item.system {
  align-self: flex-start;
}

.message-item.card-wrapper {
  max-width: 78%;
}

.message-item.user {
  align-self: flex-end;
}

.message-item.welcome-message {
  max-width: 78%;
  margin-top: 0;
}

.message-item.welcome-message .bubble {
  background-color: #F1F4F6;
  border-radius: 12px;
  padding: 10px 16px;
  font-size: 14px;
  line-height: 1.57;
  font-weight: 400;
}

/* ===== Base Bubble ===== */
.bubble {
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.57;
  word-wrap: break-word;
  font-weight: 400;
}

.system .bubble {
  background-color: #F1F4F6;
  color: #1B2129;
}

.user .bubble {
  background-color: #246FE5;
  color: #FFFFFF;
}

/* ===== Rich Content (AI reply with links) ===== */
.rich-content {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
  line-height: 1.57;
}

/* 工单蓝色链接 */
:deep(.ticket-link) {
  color: #246FE5;
  font-weight: 600;
  cursor: pointer;
}

/* ===== 图片消息 ===== */
.image-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-image {
  max-width: 100%;
  border-radius: 4px;
  display: block;
  outline: 1px #F7F9FA solid;
  outline-offset: -1px;
}

.image-caption {
  font-size: 14px;
  opacity: 0.9;
}

/* ===== 工单卡片（通用） ===== */
.order-card {
  background-color: #F1F4F6;
  border-radius: 12px;
  padding: 10px 16px;
  font-size: 14px;
  color: #1B2129;
  width: 100%;
  font-weight: 400;
}

.card-title {
  font-weight: 400;
  margin-bottom: 0;
  font-size: 14px;
  color: #1B2129;
}

.card-details {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-bottom: 0;
  margin-top: 0;
}

.detail-row {
  display: flex;
  line-height: 1.57;
  margin-top: 0;
}

.detail-label {
  color: #1B2129;
  flex-shrink: 0;
  font-size: 14px;
}

.detail-value {
  color: #1B2129;
  flex: 1;
  word-break: break-all;
  font-size: 14px;
}

.card-hint {
  font-size: 14px;
  color: #1B2129;
  line-height: 1.57;
  margin-bottom: 0;
  margin-top: 16px;
}

.warn-hint {
  color: #1B2129;
}

/* ===== 工单提交卡片按钮 ===== */
.submit-ticket-btn {
  width: 100%;
  height: 32px;
  padding: 0;
  margin-top: 12px;
  background-color: #FFFFFF;
  color: #1B2129;
  border: none;
  border-radius: 40px;
  font-size: 12px;
  font-weight: 400;
  cursor: pointer;
  transition: opacity 0.2s, background-color 0.2s, color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.submit-ticket-btn:active:not(:disabled) {
  opacity: 0.85;
}

.submit-ticket-btn-inner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.submit-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(27, 33, 41, 0.2);
  border-top-color: #1B2129;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.submit-ticket-btn.submitting {
  background-color: #E8ECF0;
  color: #626C78;
  cursor: not-allowed;
}

.submit-ticket-btn.submitting .submit-spinner {
  border-color: rgba(98, 108, 120, 0.2);
  border-top-color: #626C78;
}

.submit-ticket-btn.done {
  background-color: #34C759;
  color: #FFFFFF;
  cursor: not-allowed;
  opacity: 0.9;
}

.submit-success-content {
  margin-top: 24px;
  color: #1B2129;
  font-size: 14px;
  line-height: 1.57;
}

/* ===== Timestamp ===== */
.timestamp {
  font-size: 12px;
  color: #999999;
  margin-top: 4px;
  text-align: right;
}

.system .timestamp {
  text-align: left;
  margin-left: 4px;
}

/* ===== Typing Indicator ===== */
.typing-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 72px;
  height: 40px;
  padding: 0;
  background-color: #F1F4F6;
  border-radius: 12px;
}

.dot {
  width: 6px;
  height: 6px;
  background-color: #999999;
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
}

.dot:nth-child(1) { animation-delay: -0.32s; }
.dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1.0); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
