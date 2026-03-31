<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import { showToast } from '@/utils/toast'
import LlmConfigPanel from '@/components/LlmConfigPanel.vue'

const router = useRouter()
const chatStore = useChatStore()
const phone = ref('')
const verifyCode = ref('')
const countdown = ref(0)
const showWechatPanel = ref(false)
const showLlmPanel = ref(false)
const llmPanelClosable = ref(true)
const isLoggingIn = ref(false)
const isSendingCode = ref(false)
let timer = null

const isValidPhone = computed(() => {
  return /^1[3-9]\d{9}$/.test(phone.value)
})

const canSubmit = computed(() => {
  return isValidPhone.value && verifyCode.value.length === 6
})

// 微信授权面板
const openWechatPanel = () => {
  showWechatPanel.value = true
}

const closeWechatPanel = () => {
  showWechatPanel.value = false
}

const handleWechatDeny = () => {
  closeWechatPanel()
  showToast('已取消授权')
}

const getVerifyCode = async () => {
  if (!isValidPhone.value || countdown.value > 0 || isSendingCode.value) return
  
  isSendingCode.value = true
  try {
    const response = await fetch('/mid-permission-server/restUserService/smsSendCode', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'group-code': 'TYXN',
        'groupcode': 'TYXN',
        'project-id': 'Pj9909990007'
      },
      body: JSON.stringify({
        phone_num: phone.value,
        codeLen: 6
      })
    })
    
    if (!response.ok) {
      throw new Error('网络请求失败')
    }
    
    const data = await response.json()
    console.log('接口返回数据:', data)
    if (data.Result === 'success' || data.ResultCode === '00000') {
      startCountdown()
      showToast('发送成功')
    } else {
      showToast('发送验证码失败: ' + (data.message || data.msg || '未知错误'))
    }
  } catch (error) {
    console.error('Error sending verify code:', error)
    showToast('发送验证码出错')
  } finally {
    isSendingCode.value = false
  }
}

const startCountdown = () => {
  countdown.value = 60
  timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(timer)
    }
  }, 1000)
}

const handleLogin = async () => {
  if (!canSubmit.value || isLoggingIn.value) return

  isLoggingIn.value = true
  try {
    // 1. 验证码检查
    const formData = new FormData()
    formData.append('jsonString', JSON.stringify({
      verifyCode: verifyCode.value,
      userPhoneNum: phone.value
    }))

    const checkResponse = await fetch('/mid-permission-server/Spring/MVC/entrance/unifier/checkVerifyCodeService', {
      method: 'POST',
      headers: {
        'group-code': 'TYXN',
        'groupcode': 'TYXN',
        'project-id': 'Pj9909990007'
      },
      body: formData
    })

    if (!checkResponse.ok) {
      throw new Error('验证码检查失败')
    }

    const checkData = await checkResponse.json()
    console.log('验证码检查返回:', checkData)

    if (checkData.result === 'success' || checkData.resultCode === '00000') {
      // 尝试从多个可能的字段提取 token
      const token = 
        checkData.Item?.token || 
        checkData.item?.token || 
        checkData.Token || 
        checkData.token ||
        checkResponse.headers.get('token') ||
        ''
      
      console.log('提取的token:', token ? `${token.substring(0, 30)}...` : 'EMPTY')
      console.log('完整响应:', JSON.stringify(checkData, null, 2))
      console.log('响应headers:', checkResponse.headers.get('token'))
      
      if (!token) {
        console.warn('未找到token，尝试从其他接口获取...')
      }

      const tenantResponse = await fetch('/fm-workorder-server/restSpaceService/getBindingTenantList', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'group-code': 'TYXN',
          'groupcode': 'TYXN',
          'project-id': 'Pj9909990007',
          'token': token
        },
        body: JSON.stringify({ mobile: phone.value })
      })

      if (!tenantResponse.ok) {
        throw new Error('获取租户信息失败')
      }

      const tenantData = await tenantResponse.json()

      // 保存登录信息
      chatStore.login(phone.value, token, tenantData)

      // 检查 LLM 配置
      if (chatStore.hasLlmConfig) {
        // 已配置，直接进入主页
        router.push('/home')
      } else {
        // 未配置，弹出配置面板（不可关闭，必须填写）
        llmPanelClosable.value = false
        showLlmPanel.value = true
      }
    } else {
      showToast('验证码错误')
    }
  } catch (error) {
    console.error('Login error:', error)
    showToast('登录失败，请重试')
  } finally {
    isLoggingIn.value = false
  }
}

// LLM 配置面板
const openLlmPanel = () => {
  llmPanelClosable.value = true
  showLlmPanel.value = true
}

const closeLlmPanel = () => {
  showLlmPanel.value = false
}

const handleLlmConfirm = (config) => {
  chatStore.saveLlmConfig(config)
  showLlmPanel.value = false
  showToast('LLM配置保存成功')
  // 如果已登录，跳转主页
  if (chatStore.isLoggedIn) {
    router.push('/home')
  }
}
</script>

<template>
  <div class="login-container">
    <div class="header-section">
      <div class="logo-box">
        <img src="/icons/logo2.svg" alt="Logo" class="logo" />
      </div>
      <div class="header-text">
        <h1 class="title">欢迎使用用户报事</h1>
        <p class="subtitle">为方便维修核实请登录后再进行用户报事</p>
      </div>
    </div>

    <div class="form-section">
      <div class="input-area">
        <div class="input-group">
          <input 
            v-model="phone" 
            type="tel" 
            placeholder="请输入手机号" 
            maxlength="11"
            class="text-input"
          />
        </div>

        <div class="input-group row">
          <div class="verify-input-wrapper">
            <input
              v-model="verifyCode"
              type="text"
              placeholder="请输入验证码"
              maxlength="6"
              class="text-input"
            />
          </div>
          <button 
            class="verify-btn" 
            :class="{ 'is-loading': isSendingCode }"
            :disabled="!isValidPhone || countdown > 0 || isSendingCode"
            @click="getVerifyCode"
          >
            <svg v-if="isSendingCode" class="spinner" viewBox="0 0 50 50">
              <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
            </svg>
            {{ isSendingCode ? '发送中...' : (countdown > 0 ? `${countdown}s后重新获取` : '获取验证码') }}
          </button>
        </div>
      </div>

      <div class="button-area">
        <button 
          class="login-btn" 
          :class="{ 'is-loading': isLoggingIn }"
          :disabled="!canSubmit || isLoggingIn"
          @click="handleLogin"
        >
          <svg v-if="isLoggingIn" class="spinner" viewBox="0 0 50 50">
            <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
          </svg>
          {{ isLoggingIn ? '登录中...' : '登录' }}
        </button>

        <button class="wechat-btn" @click="openWechatPanel">
          <img src="/icons/wechat.svg" alt="微信" class="wechat-icon" />
          <span>微信授权手机号登录</span>
        </button>

        <button class="llm-config-btn" @click="openLlmPanel">
          <img src="/icons/connect.svg" alt="配置" class="llm-config-icon" />
          <span>配置LLM信息</span>
        </button>
      </div>
    </div>

    <!-- LLM 配置面板 -->
    <LlmConfigPanel
      :show="showLlmPanel"
      :closable="llmPanelClosable"
      @close="closeLlmPanel"
      @confirm="handleLlmConfirm"
    />

    <!-- 微信授权面板 -->
    <Transition name="slide-up">
      <div v-if="showWechatPanel" class="wechat-panel-overlay" @click="closeWechatPanel">
        <div class="wechat-panel" @click.stop>
          <div class="wechat-panel-content">
            <!-- 头部信息 -->
            <div class="wechat-header">
              <div class="wechat-logo-title">
                <img src="/icons/logo2.svg" alt="Logo" class="wechat-mini-logo" />
                <span class="wechat-app-name">智能报事</span>
              </div>
              <div class="wechat-title">申请获取并验证你的手机号</div>
              <div class="wechat-subtitle">快速注册账号</div>
            </div>

            <!-- 手机号展示 -->
            <div class="wechat-phone-card">
              <div class="wechat-phone-number">138****2649</div>
              <div class="wechat-phone-tag">上次提供</div>
            </div>

            <!-- 不允许按钮 -->
            <button class="wechat-deny-btn" @click="handleWechatDeny">不允许</button>

            <!-- 管理号码 -->
            <div class="wechat-manage">管理号码</div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.login-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100vh;
  background-color: #F1F4F6;
}

.header-section {
  margin-top: 160px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 80px;
}

.header-text {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.logo-box {
  width: 64px;
  height: 64px;
}

.logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.title {
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.4;
  color: #2E3742;
  text-align: center;
  margin: 0;
}

.subtitle {
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.67;
  color: #8B949E;
  text-align: center;
  margin: 0;
}

.form-section {
  width: 100%;
  padding: 0 32px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.input-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.button-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-group {
  background-color: #FFFFFF;
  border-radius: 8px;
  height: 44px;
  display: flex;
  align-items: center;
  padding: 0 16px;
}

.input-group.row {
  background-color: transparent;
  padding: 0;
  gap: 8px;
}

.verify-input-wrapper {
  flex: 1;
  background-color: #FFFFFF;
  border-radius: 8px;
  height: 100%;
  display: flex;
  align-items: center;
  padding: 0 16px;
}

.text-input {
  width: 100%;
  border: none;
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.57;
  color: #2E3742;
  outline: none;
  background: none;
}

.text-input::placeholder {
  color: #C4C9CF;
}

.verify-btn {
  flex-shrink: 0;
  height: 100%;
  background-color: #FFFFFF;
  border-radius: 8px;
  border: none;
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.57;
  color: #1B2129;
  padding: 0 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

.verify-btn:disabled {
  opacity: 0.5;
}

.login-btn {
  width: 100%;
  height: 44px;
  background-color: #246FE5;
  color: #FFFFFF;
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.57;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  width: 16px;
  height: 16px;
  animation: rotate 2s linear infinite;
  margin-right: 8px;
}

.path {
  stroke: currentColor;
  stroke-linecap: round;
  animation: dash 1.5s ease-in-out infinite;
}

@keyframes rotate {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes dash {
  0% {
    stroke-dasharray: 1, 150;
    stroke-dashoffset: 0;
  }
  50% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -35;
  }
  100% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -124;
  }
}

.login-btn:disabled {
  opacity: 0.5;
}

.login-btn:active:not(:disabled) {
  opacity: 0.9;
}

.wechat-btn {
  width: 100%;
  height: 44px;
  background-color: #FFFFFF;
  border: none;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.57;
  color: #1B2129;
}

.wechat-btn:active {
  opacity: 0.9;
}

.wechat-icon {
  width: 18px;
  height: 18px;
}

/* LLM 配置按钮 */
.llm-config-btn {
  width: 100%;
  height: 44px;
  background-color: #FFFFFF;
  border: none;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.57;
  color: #1B2129;
}

.llm-config-btn:active {
  opacity: 0.9;
}

.llm-config-icon {
  width: 18px;
  height: 18px;
}

/* 微信授权面板样式 */
.wechat-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.70);
  display: flex;
  align-items: flex-end;
  z-index: 1000;
}

.wechat-panel {
  width: 100%;
  background: #F7F7F7;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  padding: 32px 24px;
  box-sizing: border-box;
}

.wechat-panel-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.wechat-header {
  width: 100%;
  margin-bottom: 24px;
}

.wechat-logo-title {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.wechat-mini-logo {
  width: 24px;
  height: 24px;
  margin-right: 8px;
}

.wechat-app-name {
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: #1B2129;
}

.wechat-title {
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 16px;
  font-weight: 600;
  color: #1B2129;
  text-align: center;
  margin-bottom: 8px;
}

.wechat-subtitle {
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 13px;
  font-weight: 400;
  color: #626C78;
  text-align: center;
}

.wechat-phone-card {
  width: 100%;
  background: #FFFFFF;
  border-radius: 8px;
  padding: 12px 0;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.wechat-phone-number {
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 16px;
  font-weight: 400;
  color: #1B2129;
}

.wechat-phone-tag {
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 12px;
  font-weight: 400;
  color: #07C160;
  margin-top: 4px;
}

.wechat-deny-btn {
  width: 100%;
  height: 48px;
  background: #FFFFFF;
  border: none;
  border-radius: 8px;
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 16px;
  font-weight: 400;
  color: #1B2129;
  cursor: pointer;
  margin-bottom: 24px;
}

.wechat-deny-btn:active {
  opacity: 0.9;
}

.wechat-manage {
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: #576B95;
  cursor: pointer;
}

/* 滑入动画 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-active .wechat-panel,
.slide-up-leave-active .wechat-panel {
  transition: transform 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  background: rgba(0, 0, 0, 0);
}

.slide-up-enter-from .wechat-panel,
.slide-up-leave-to .wechat-panel {
  transform: translateY(100%);
}

.slide-up-enter-to .wechat-panel,
.slide-up-leave-from .wechat-panel {
  transform: translateY(0);
}
</style>
