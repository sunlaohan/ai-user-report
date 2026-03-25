<script setup>
import { useChatStore } from '@/stores/chat'
import { storeToRefs } from 'pinia'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { convertToJpeg } from '@/utils/imageUtils'

const chatStore = useChatStore()
const { inputMode, isRecording } = storeToRefs(chatStore)
const textInput = ref('')
const fileInput = ref(null)
const voiceText = ref('')
const isProbablyIOS = /iP(hone|od|ad)/i.test(navigator.userAgent)

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

const voiceSupportStatus = computed(() => {
  if (recognition) return 'ready'
  if (!window.isSecureContext) return 'https_required'
  return 'browser_unsupported'
})

const getVoiceUnavailableMessage = () => {
  if (voiceSupportStatus.value === 'https_required') {
    return '当前链接不是 HTTPS，移动端网页语音识别通常需要安全链接。请改用 HTTPS 地址后重试。'
  }

  if (isProbablyIOS) {
    return '当前浏览器没有开放网页语音识别能力。请尽量使用 Safari，并确认系统已开启 Siri 与听写；如仍无效，请先切换键盘输入。'
  }

  return '当前浏览器不支持网页语音识别，请切换到支持的浏览器或先使用键盘输入。'
}

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'zh-CN';

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    // Only update if there is actual input, falling back keeps previous state better
    if (finalTranscript || interimTranscript) {
       voiceText.value = (finalTranscript + interimTranscript).trim();
    }
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error', event.error);
    const errorMessageMap = {
      'not-allowed': '无法获取麦克风权限，请检查浏览器与系统设置。',
      'service-not-allowed': '系统语音识别服务不可用，请确认已开启 Siri 与听写。',
      'network': '语音识别网络异常，请稍后重试。',
      'no-speech': '没有识别到语音内容，请再试一次。'
    }

    if (errorMessageMap[event.error]) {
      alert(errorMessageMap[event.error]);
    }
    chatStore.setRecording(false);
  };
  
  recognition.onend = () => {
    // If we're still supposed to be recording but it ended automatically, attempt restart
    if (isRecording.value && recognition) {
      try { recognition.start(); } catch(e){}
    }
  };
}


const switchToVoiceMode = () => {
  if (inputMode.value === 'text') {
    chatStore.toggleInputMode()
  }
}

const switchToTextMode = () => {
  if (inputMode.value === 'voice') {
    chatStore.toggleInputMode()
  }
}

const sendMessage = () => {
  if (!textInput.value.trim()) return
  
  chatStore.addMessage({
    type: 'user',
    content: textInput.value
  })
  textInput.value = ''
}

const triggerFileInput = () => {
  fileInput.value?.click()
}


const handleFileChange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  // 1. Show a temporary loading message
  chatStore.addMessage({
    type: 'system',
    content: '图片上传中，请稍候...',
    id: 'temp-uploading'
  });

  try {
    // 1.5 Convert to JPEG if needed (FMS rejects .webp etc.)
    const uploadFile = await convertToJpeg(file);

    // 2. Perform full 3-step FMS upload pipeline
    const uploadResult = await chatStore.uploadImage(uploadFile);
    
    // 3. Remove the temporary uploading message
    chatStore.messages = chatStore.messages.filter(m => m.id !== 'temp-uploading');

    // 4. Read as Base64 for local UI preview, attach real fileId for ticket creation
    const reader = new FileReader();
    reader.onload = (e) => {
      chatStore.addMessage({
        type: 'user',
        content: '[用户上传了一张现场相关图片]',
        imageUrl: e.target.result,           // For UI rendering only
        fileId: uploadResult.fileId,          // Real FMS file key for ticket photos[]
        fileName: uploadResult.fileName || uploadFile.name,
        fileUrl: uploadResult.fileUrl || ''   // MinIO download URL if available
      });
    };
    reader.readAsDataURL(file); // Use original for preview quality
  } catch (err) {
    // Remove the temp message and show error
    chatStore.messages = chatStore.messages.filter(m => m.id !== 'temp-uploading');
    chatStore.addMessage({
      type: 'system',
      content: `图片上传失败: ${err.message || '请重试'}`
    });
  }

  event.target.value = '';
}

const startRecording = () => {
  if (isRecording.value) return

  if (voiceSupportStatus.value !== 'ready') {
    alert(getVoiceUnavailableMessage());
    switchToTextMode()
    return;
  }
  voiceText.value = '';
  chatStore.setRecording(true);
  try {
    recognition.start();
  } catch(e) {
    console.warn("Recognition already started", e);
  }
}

const stopRecording = () => {
  if (!isRecording.value) return; // Prevent double-trigger
  
  chatStore.setRecording(false);
  
  if (recognition) {
    recognition.stop();
  }

  // Allow a tiny delay for final recognizer parsing
  setTimeout(() => {
    if (voiceText.value) {
      chatStore.addMessage({
        type: 'user',
        content: voiceText.value
      });
      voiceText.value = '';
    } else {
      console.log('没有识别到语音内容。');
    }
  }, 350);
}

const handlePointerLeave = (event) => {
  if (event.buttons === 0 && isRecording.value) {
    stopRecording()
  }
}

// Handle Spacebar for PC Push-to-Talk
const handleKeyDown = (e) => {
  if (e.code === 'Space' && inputMode.value === 'voice' && !isRecording.value) {
    e.preventDefault() 
    startRecording()
  }
}

const handleKeyUp = (e) => {
  if (e.code === 'Space' && isRecording.value) {
    e.preventDefault()
    stopRecording()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})
</script>

<template>
  <div class="input-area">
    <div class="toolbar">
      <!-- Left: Camera (Always visible) -->
      <button class="icon-btn camera-btn" @click="triggerFileInput">
        <img src="/icons/camera.svg" alt="Camera" />
      </button>
      <input 
        type="file" 
        accept="image/*" 
        ref="fileInput" 
        @change="handleFileChange" 
        style="display: none;" 
      />

      <!-- Center & Right: Based on Mode -->
      
      <!-- Text Input Mode -->
      <template v-if="inputMode === 'text'">
        <div class="input-wrapper">
          <input 
            v-model="textInput" 
            @keyup.enter="sendMessage"
            type="text" 
            placeholder="请输入"
            class="text-input"
          />
          <button class="icon-btn mic-btn" @click="switchToVoiceMode">
            <img src="/icons/mic-o.svg" alt="Voice" />
          </button>
        </div>
        
        <button class="send-btn" @click="sendMessage">
          <img src="/icons/send.svg" alt="Send" />
        </button>
      </template>

      <!-- Voice Input Mode -->
      <template v-else>
        <div class="voice-container">
          <button 
            class="voice-btn"
            :class="{ recording: isRecording }"
            @pointerdown.prevent="startRecording"
            @pointerup.prevent="stopRecording"
            @pointercancel.prevent="stopRecording"
            @pointerleave="handlePointerLeave"
          >
            {{ isRecording ? '松开 结束' : '按住说话' }}
          </button>
        </div>
        
        <button class="icon-btn right-btn" @click="switchToTextMode">
          <img src="/icons/keyboard.svg" alt="Keyboard" />
        </button>
      </template>
    </div>
    
    <!-- Recording Overlay -->
    <div v-if="isRecording" class="recording-overlay">
      <div class="recording-content">
        <img src="/icons/mic-o.svg" class="recording-icon mic-pulse" />
        <p class="recording-text">{{ voiceText || '倾听中...' }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-area {
  padding: 8px 12px 4px;
  background-color: #FFFFFF;
  box-shadow: 0px 0.5px 3px 0px rgba(27, 33, 41, 0.08), 0px 3px 12px 0px rgba(27, 33, 41, 0.12);
  padding-bottom: max(10px, env(safe-area-inset-bottom));
  position: relative;
  z-index: 20;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: auto;
  min-height: 48px;
}

.icon-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
}

.icon-btn img {
  width: 24px;
  height: 24px;
}

/* Text Mode Styles */
.input-wrapper {
  flex: 1;
  height: 40px;
  background-color: #F1F4F6;
  border-radius: 8px;
  display: flex;
  align-items: center;
  padding: 0 8px 0 12px;
  position: relative;
}

.text-input {
  flex: 1;
  height: 100%;
  border: none;
  background: none;
  font-size: 14px;
  outline: none;
  color: #1B2129;
  padding-right: 8px;
}

.text-input::placeholder {
  color: #8B949E;
}

.mic-btn {
  width: 32px;
  height: 32px;
}

.mic-btn img {
  width: 20px; /* Smaller icon inside input */
  height: 20px;
}

.send-btn {
  width: 40px;
  height: 40px;
  background-color: #246FE5; /* Blue background matching Figma */
  border: none;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.send-btn img {
  width: 20px;
  height: 20px;
  filter: brightness(0) invert(1); /* Make icon white */
}

.send-btn:active {
  opacity: 0.8;
}

/* Voice Mode Styles */
.voice-container {
  flex: 1;
  height: 40px;
}

.voice-btn {
  width: 100%;
  height: 40px;
  border: none;
  border-radius: 8px;
  background-color: #F1F4F6;
  font-size: 14px;
  font-weight: 600; /* Bold as per Figma 14/Bold */
  color: #2E3742;
  user-select: none;
  touch-action: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.voice-btn:active, .voice-btn.recording {
  background-color: #E0E0E0;
}

/* Recording Overlay */
.recording-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.recording-content {
  background-color: rgba(0, 0, 0, 0.8);
  padding: 24px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #FFFFFF;
  width: 240px;
  min-height: 160px;
  box-sizing: border-box;
  text-align: center;
  justify-content: center;
}

.recording-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  filter: invert(1);
}

.mic-pulse {
  animation: pulse-op 1.5s infinite;
}

@keyframes pulse-op {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.7; }
  100% { transform: scale(1); opacity: 1; }
}

.recording-text {
  font-size: 16px;
  line-height: 1.5;
  word-wrap: break-word;
  word-break: break-all;
  width: 100%;
  max-height: 100px;
  overflow-y: auto;
  margin: 0;
}
</style>
