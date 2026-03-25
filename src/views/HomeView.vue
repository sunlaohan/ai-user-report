<script setup>
import MessageList from '@/components/MessageList.vue'
import InputArea from '@/components/InputArea.vue'
import TraditionalReport from '@/components/TraditionalReport.vue'
import { useChatStore } from '@/stores/chat'
import { storeToRefs } from 'pinia'

const chatStore = useChatStore()
const { isAiMode } = storeToRefs(chatStore)

const toggleAiMode = () => {
  isAiMode.value = !isAiMode.value
}
</script>

<template>
  <div class="home-container">
    <header class="header">
      <div class="header-left">
        <div class="logo-container">
          <img src="/icons/logo.svg" alt="Logo" class="logo" />
        </div>
        <div class="header-text">
          <div class="title">Ai用户报事</div>
          <div class="subtitle">小觅智能助手</div>
        </div>
      </div>
      
      <div class="header-right" @click="toggleAiMode">
        <span class="mode-label">Ai模式</span>
        <img 
          :src="isAiMode ? '/icons/Switch-on.svg' : '/icons/Switch-off.svg'" 
          alt="Switch Mode" 
          class="switch-icon" 
        />
      </div>
    </header>
    
    <template v-if="isAiMode">
      <main class="content">
        <MessageList />
      </main>
      
      <footer class="footer">
        <InputArea />
      </footer>
    </template>

    <template v-else>
      <TraditionalReport />
    </template>
  </div>
</template>

<style scoped>
.home-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #F5F6FA;
}

.header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background-color: #FFFFFF;
  border-bottom: 1px solid #E5E5E5;
  flex-shrink: 0;
  z-index: 10; /* Ensure header stays on top */
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-container {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
}

.logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.header-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.title {
  font-size: 16px;
  font-weight: 600;
  color: #333333;
  line-height: 1.2;
}

.subtitle {
  font-size: 12px;
  color: #999999;
  line-height: 1.2;
  margin-top: 2px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.mode-label {
  font-size: 14px;
  color: #999999;
}

.switch-icon {
  width: 40px;
  height: 24px;
}

.content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.footer {
  flex-shrink: 0;
  background-color: #FFFFFF;
}
</style>
