<script setup>
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  closable: { type: Boolean, default: true }
})

const emit = defineEmits(['close', 'confirm'])

// 预置平台列表
const PROVIDERS = [
  { id: 'volcano', name: '火山引擎（豆包）', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
  { id: 'qwen', name: '通义千问（阿里云百炼）', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'zhipu', name: '智谱 AI', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'moonshot', name: '月之暗面（Kimi）', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'custom', name: '自定义', baseUrl: '' }
]

const selectedProvider = ref('volcano')
const customBaseUrl = ref('')
const modelId = ref('')
const apiKey = ref('')
const showDropdown = ref(false)

const currentProvider = computed(() => {
  return PROVIDERS.find(p => p.id === selectedProvider.value) || PROVIDERS[0]
})

const effectiveBaseUrl = computed(() => {
  if (selectedProvider.value === 'custom') {
    return customBaseUrl.value.trim()
  }
  return currentProvider.value.baseUrl
})

const canSubmit = computed(() => {
  return effectiveBaseUrl.value && modelId.value.trim() && apiKey.value.trim()
})

// 从 localStorage 回显已保存的配置
onMounted(() => {
  loadSavedConfig()
})

watch(() => props.show, (val) => {
  if (val) {
    loadSavedConfig()
  }
})

function loadSavedConfig() {
  const saved = localStorage.getItem('llmConfig')
  if (saved) {
    try {
      const config = JSON.parse(saved)
      selectedProvider.value = config.provider || 'volcano'
      customBaseUrl.value = config.customBaseUrl || ''
      modelId.value = config.modelId || ''
      apiKey.value = config.apiKey || ''
    } catch (e) {
      console.warn('Failed to load saved LLM config', e)
    }
  }
}

function selectProvider(providerId) {
  selectedProvider.value = providerId
  showDropdown.value = false
}

function handleClose() {
  if (props.closable) {
    emit('close')
  }
}

function handleConfirm() {
  if (!canSubmit.value) return

  const config = {
    provider: selectedProvider.value,
    providerName: currentProvider.value.name,
    baseUrl: effectiveBaseUrl.value,
    customBaseUrl: customBaseUrl.value,
    modelId: modelId.value.trim(),
    apiKey: apiKey.value.trim()
  }

  // 保存到 localStorage
  localStorage.setItem('llmConfig', JSON.stringify(config))

  emit('confirm', config)
}

function handleOverlayClick() {
  if (props.closable) {
    emit('close')
  }
}
</script>

<template>
  <Transition name="llm-slide">
    <div v-if="show" class="llm-overlay" @click="handleOverlayClick">
      <div class="llm-panel" @click.stop>
        <!-- 导航栏 -->
        <div class="llm-navbar">
          <div class="llm-navbar-left" @click="handleClose">
            <svg v-if="closable" width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M6 6L16 16M16 6L6 16" stroke="#1B2129" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="llm-navbar-title">配置LLM信息</div>
          <div class="llm-navbar-right"></div>
        </div>

        <!-- 表单 -->
        <div class="llm-form">
          <div class="llm-card">
            <!-- API 平台选择 -->
            <div class="llm-field">
              <div class="llm-field-header">
                <span class="llm-field-required">*</span>
                <span class="llm-field-label">API 平台</span>
              </div>
              <div class="llm-select" @click="showDropdown = !showDropdown">
                <span class="llm-select-value">{{ currentProvider.name }}</span>
                <svg class="llm-select-arrow" :class="{ open: showDropdown }" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="#8B949E" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <Transition name="dropdown-fade">
                <div v-if="showDropdown" class="llm-dropdown">
                  <div
                    v-for="provider in PROVIDERS"
                    :key="provider.id"
                    class="llm-dropdown-item"
                    :class="{ active: selectedProvider === provider.id }"
                    @click="selectProvider(provider.id)"
                  >
                    {{ provider.name }}
                    <svg v-if="selectedProvider === provider.id" width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 7L6 10L11 4" stroke="#246FE5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                </div>
              </Transition>
            </div>
            <div class="llm-divider"></div>

            <!-- Base URL (自定义时可编辑) -->
            <div v-if="selectedProvider === 'custom'" class="llm-field">
              <div class="llm-field-header">
                <span class="llm-field-required">*</span>
                <span class="llm-field-label">Base URL</span>
              </div>
              <div class="llm-input-row">
                <input
                  v-model="customBaseUrl"
                  type="text"
                  class="llm-input"
                  placeholder="请输入 API Base URL"
                />
              </div>
            </div>
            <div v-else class="llm-field">
              <div class="llm-field-header">
                <span class="llm-field-label llm-field-label-readonly">Base URL</span>
              </div>
              <div class="llm-input-row">
                <span class="llm-base-url-display">{{ currentProvider.baseUrl }}</span>
              </div>
            </div>
            <div class="llm-divider"></div>

            <!-- MODEL_ID -->
            <div class="llm-field">
              <div class="llm-field-header">
                <span class="llm-field-required">*</span>
                <span class="llm-field-label">MODEL_ID</span>
              </div>
              <div class="llm-input-row">
                <input
                  v-model="modelId"
                  type="text"
                  class="llm-input"
                  placeholder="请输入类似ep-xxxxx的ID"
                />
              </div>
            </div>
            <div class="llm-divider"></div>

            <!-- API_KEY -->
            <div class="llm-field">
              <div class="llm-field-header">
                <span class="llm-field-required">*</span>
                <span class="llm-field-label">API_KEY</span>
              </div>
              <div class="llm-input-row">
                <input
                  v-model="apiKey"
                  type="password"
                  class="llm-input"
                  placeholder="请输入类似f374axxxxxx的key"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 底部操作栏 -->
        <div class="llm-bottom-bar">
          <button
            class="llm-confirm-btn"
            :disabled="!canSubmit"
            @click="handleConfirm"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ===== 遮罩层 ===== */
.llm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  z-index: 1000;
}

/* ===== 面板 ===== */
.llm-panel {
  background: #F1F4F6;
  border-radius: 16px 16px 0 0;
  display: flex;
  flex-direction: column;
  max-height: 85vh;
  overflow-y: auto;
}

/* ===== 导航栏 ===== */
.llm-navbar {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 16px;
  flex-shrink: 0;
}

.llm-navbar-left {
  width: 44px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  cursor: pointer;
}

.llm-navbar-title {
  flex: 1;
  text-align: center;
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  color: #1B2129;
}

.llm-navbar-right {
  width: 44px;
}

/* ===== 表单区域 ===== */
.llm-form {
  padding: 0 16px 16px;
}

.llm-card {
  background: #FFFFFF;
  border-radius: 8px;
  overflow: visible;
  position: relative;
}

/* ===== 字段 ===== */
.llm-field {
  padding: 10px 16px;
  position: relative;
}

.llm-field-header {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-bottom: 8px;
}

.llm-field-required {
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: #F55047;
  line-height: 1;
}

.llm-field-label {
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.57;
  color: #424C59;
}

.llm-field-label-readonly {
  color: #8B949E;
}

/* ===== 输入框 ===== */
.llm-input-row {
  display: flex;
  align-items: center;
}

.llm-input {
  width: 100%;
  border: none;
  outline: none;
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.57;
  color: #1B2129;
  background: none;
  padding: 0;
}

.llm-input::placeholder {
  color: #C4C9CF;
}

.llm-base-url-display {
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.57;
  color: #8B949E;
  word-break: break-all;
}

/* ===== 分割线 ===== */
.llm-divider {
  height: 0.5px;
  background: #E1E5EB;
  margin: 0 16px;
}

/* ===== 下拉选择 ===== */
.llm-select {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: 4px 0;
}

.llm-select-value {
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.57;
  color: #1B2129;
}

.llm-select-arrow {
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.llm-select-arrow.open {
  transform: rotate(180deg);
}

/* ===== 下拉菜单 ===== */
.llm-dropdown {
  position: absolute;
  left: 16px;
  right: 16px;
  top: 100%;
  background: #FFFFFF;
  border-radius: 8px;
  box-shadow: 0px 3px 12px 0px rgba(27, 33, 41, 0.12), 0px 0.5px 3px 0px rgba(27, 33, 41, 0.08);
  z-index: 10;
  overflow: hidden;
  margin-top: 4px;
}

.llm-dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.57;
  color: #1B2129;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.llm-dropdown-item:active {
  background: #F1F4F6;
}

.llm-dropdown-item.active {
  color: #246FE5;
  font-weight: 500;
}

/* ===== 底部操作栏 ===== */
.llm-bottom-bar {
  padding: 8px 12px 24px;
  background: #FFFFFF;
  box-shadow: 0px 0.5px 3px 0px rgba(27, 33, 41, 0.08), 0px 3px 12px 0px rgba(27, 33, 41, 0.12);
  flex-shrink: 0;
}

.llm-confirm-btn {
  width: 100%;
  height: 44px;
  background: #246FE5;
  color: #FFFFFF;
  border: none;
  border-radius: 8px;
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.57;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.llm-confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.llm-confirm-btn:active:not(:disabled) {
  opacity: 0.85;
}

/* ===== 动画 ===== */
.llm-slide-enter-active,
.llm-slide-leave-active {
  transition: all 0.3s ease;
}

.llm-slide-enter-active .llm-panel,
.llm-slide-leave-active .llm-panel {
  transition: transform 0.3s ease;
}

.llm-slide-enter-from,
.llm-slide-leave-to {
  background: rgba(0, 0, 0, 0);
}

.llm-slide-enter-from .llm-panel,
.llm-slide-leave-to .llm-panel {
  transform: translateY(100%);
}

.llm-slide-enter-to .llm-panel,
.llm-slide-leave-from .llm-panel {
  transform: translateY(0);
}

/* ===== 下拉菜单动画 ===== */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
