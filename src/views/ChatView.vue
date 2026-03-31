<script setup>
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import MessageList from '@/components/MessageList.vue'
import InputArea from '@/components/InputArea.vue'
import TraditionalReport from '@/components/TraditionalReport.vue'
import TicketList from '@/components/TicketList.vue'
import { useChatStore } from '@/stores/chat'
import { storeToRefs } from 'pinia'

const route = useRoute()
const chatStore = useChatStore()
const { isAiMode, currentSkill } = storeToRefs(chatStore)

const skillType = computed(() => route.params.type || 'report')

const headerTitle = computed(() => {
  return skillType.value === 'query' ? 'AI查询报事' : 'AI用户报事'
})

// 只在 skill 切换时才重置消息
watch(skillType, (newType) => {
  if (currentSkill.value !== newType) {
    chatStore.switchSkill(newType)
  }
}, { immediate: false })

// 首次进入时初始化（消息为空或skill不匹配时）
onMounted(() => {
  const { messages } = chatStore
  if (messages.length === 0 || currentSkill.value !== skillType.value) {
    chatStore.switchSkill(skillType.value)
  }
})

const toggleAiMode = () => {
  isAiMode.value = !isAiMode.value
}
</script>

<template>
  <div class="chat-container">
    <header class="header">
      <div class="header-left">
        <div class="back-btn" @click="$router.push('/home')">
          <img src="/icons/back.svg" alt="Back" />
        </div>
        <div class="title">{{ headerTitle }}</div>
      </div>

      <div class="header-right" @click="toggleAiMode">
        <span class="mode-label">Ai模式</span>
        <img
          :src="isAiMode ? '/icons/Switch-on.svg' : '/icons/Switch-off.svg'"
          alt="Switch"
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
      <!-- 报事模式：传统表单 -->
      <TraditionalReport v-if="skillType === 'report'" />
      <!-- 查询模式：工单列表 -->
      <TicketList v-else />
    </template>
  </div>
</template>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #FFFFFF;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 16px 16px;
  background-color: #FFFFFF;
  flex-shrink: 0;
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.back-btn {
  width: 24px;
  height: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.back-btn img {
  width: 100%;
}

.title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  color: #2E3742;
  font-family: 'PingFang SC', -apple-system, BlinkMacSystemFont, sans-serif;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.mode-label {
  font-size: 14px;
  font-weight: 400;
  color: #8B949E;
  font-family: 'PingFang SC', -apple-system, BlinkMacSystemFont, sans-serif;
}

.switch-icon {
  width: 44px;
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
  box-shadow: 0px 0.5px 3px rgba(27, 33, 41, 0.08), 0px 3px 12px rgba(27, 33, 41, 0.12);
}
</style>
