<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import { storeToRefs } from 'pinia'

const router = useRouter()
const chatStore = useChatStore()
const { userPhone } = storeToRefs(chatStore)

const showNotice = ref(true)
const noticeText = ref('可以后台配置的通知内容，超出换行展示')

const closeNotice = () => {
  showNotice.value = false
}

const logout = () => {
  chatStore.logout()
  router.push('/login')
}

const maskedPhone = computed(() => {
  const phone = userPhone.value
  if (!phone || phone.length < 11) return phone
  return phone.substring(0, 3) + '****' + phone.substring(7)
})
</script>

<template>
  <div class="home-page">
    <!-- 背景插画 -->
    <div class="bg-illustration">
      <img src="/icons/homepage_bg.png" alt="" class="bg-img" />
    </div>

    <!-- 通知栏（叠加于背景上） -->
    <div v-if="showNotice" class="notice-bar">
      <div class="notice-pill">
        <span class="notice-text">{{ noticeText }}</span>
        <img src="/icons/notice_close.svg" alt="关闭" class="notice-close" @click="closeNotice" />
      </div>
    </div>

    <!-- 内容层（渐变遮罩 + 功能区） -->
    <div class="content-layer">
      <!-- 功能卡片区域 -->
      <div class="function-section">
        <!-- AI用户报事 -->
        <div class="function-card" @click="router.push('/chat/report')">
          <div class="card-text">
            <div class="card-title">AI用户报事</div>
            <div class="card-desc">用对话快速完成报事创建</div>
          </div>
          <img src="/icons/card_report_img.png" alt="" class="card-illustration card-illustration-report" />
        </div>

        <!-- AI报事查询 -->
        <div class="function-card" @click="router.push('/chat/query')">
          <div class="card-text">
            <div class="card-title">AI报事查询</div>
            <div class="card-desc">用对话快速查询工单相关信息</div>
          </div>
          <img src="/icons/card_query_img.png" alt="" class="card-illustration card-illustration-query" />
        </div>
      </div>

      <!-- 退出登录区域 -->
      <div class="logout-section">
        <div class="logout-pill" @click="logout">
          <span class="logout-title">退出登录</span>
          <span class="logout-account">当前账号：{{ maskedPhone }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  position: relative;
  min-height: 100vh;
  background: #E3EFFF;
  overflow-x: hidden;
}

/* ===== 背景插画 ===== */
.bg-illustration {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 320px;
  z-index: 0;
}

.bg-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* ===== 通知栏 ===== */
.notice-bar {
  position: absolute;
  top: 90px;
  left: 8px;
  right: 8px;
  z-index: 10;
}

.notice-pill {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2px;
  padding: 8px 20px;
  background: rgba(245, 249, 255, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 40px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.notice-text {
  flex: 1;
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.57;
  color: #1B2129;
}

.notice-close {
  width: 20px;
  height: 20px;
  cursor: pointer;
  flex-shrink: 0;
}

/* ===== 内容层 ===== */
.content-layer {
  position: relative;
  z-index: 5;
  margin-top: 146px;
  padding-top: 200px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 80px;
  background: linear-gradient(
    180deg,
    rgba(227, 239, 255, 0) 0%,
    rgba(227, 239, 255, 0.8) 12%,
    rgba(227, 239, 255, 1) 25%
  );
}

/* ===== 功能卡片区域 ===== */
.function-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 16px;
}

.function-card {
  position: relative;
  background: #F5F9FF;
  border-radius: 8px;
  padding: 24px 20px 32px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-shadow:
    2px 4px 12px 0px rgba(153, 180, 217, 0.3),
    inset 2px 2px 2px 0px rgba(255, 255, 255, 1);
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.2s ease;
}

.function-card:active {
  transform: scale(0.98);
}

.card-text {
  position: relative;
  z-index: 2;
}

.card-title {
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
  color: #2E3742;
}

.card-desc {
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.57;
  color: #8B949E;
}

.card-illustration {
  position: absolute;
  z-index: 1;
  pointer-events: none;
}

.card-illustration-report {
  width: 117px;
  height: 124px;
  right: 0;
  top: -16px;
}

.card-illustration-query {
  width: 122px;
  height: 118px;
  right: 0;
  top: -10px;
}

/* ===== 退出登录区域 ===== */
.logout-section {
  padding: 0 16px 80px;
}

.logout-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 20px;
  background: rgba(245, 249, 255, 0.7);
  border: 1px solid #FFFFFF;
  border-radius: 40px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.logout-pill:active {
  background: rgba(245, 249, 255, 0.9);
}

.logout-title {
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
  color: #2E3742;
}

.logout-account {
  font-family: 'PingFang SC', -apple-system, sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.57;
  color: #8B949E;
}
</style>
