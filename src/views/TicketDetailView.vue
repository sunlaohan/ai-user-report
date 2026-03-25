<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'

const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()

const ticketId = computed(() => route.params.id)
const apiOrderId = computed(() => ticketId.value)

const ticket = ref(null)
const records = ref([])
const isLoading = ref(true)
const error = ref('')

// 流程面板
const showProcessPanel = ref(false)
const processRecords = ref([])
const isLoadingProcess = ref(false)
const showImageViewer = ref(false)
const viewerImages = ref([])
const viewerIndex = ref(0)

// 工单记录 Tab
const recordTab = ref('HANDLE') // HANDLE | AUDIT | NOTE
const recordTabs = [
  { key: 'HANDLE', label: '处理记录' },
  { key: 'AUDIT', label: '审核/审批记录' },
  { key: 'NOTE', label: '历史备注' }
]

// 状态映射（根据实际接口返回）
const statusMap = {
  // 数字状态码映射（API 实际返回数字字符串）
  1:  { label: '抢单中', color: '#FF9500', bg: '#FFF7E6' },
  2:  { label: '抢单中', color: '#FF9500', bg: '#FFF7E6' },  // 实际返回
  3:  { label: '指派中', color: '#FF9500', bg: '#FFF7E6' },
  4:  { label: '待接单', color: '#1967D2', bg: '#E8F0FE' },
  5:  { label: '执行中', color: '#246FE5', bg: '#E3F2FD' },
  6:  { label: '方案审核中', color: '#1967D2', bg: '#E8F0FE' },
  7:  { label: '审批中', color: '#1967D2', bg: '#E8F0FE' },
  8:  { label: '逾期完成', color: '#34C759', bg: '#EAFAF0' },
  9:  { label: '按时完成', color: '#27B050', bg: '#EAFAF0' },
  10: { label: '异常终止', color: '#999999', bg: '#F5F5F5' },
  11: { label: '已删除', color: '#999999', bg: '#F5F5F5' },
  // 字符串枚举值映射（兼容）
  GRAB_ORDERS:            { label: '抢单中', color: '#FF9500', bg: '#FFF7E6' },
  ASSIGNMENT_IN_PROGRESS: { label: '指派中', color: '#FF9500', bg: '#FFF7E6' },
  AWAITING_FOR_PICKUP:    { label: '待接单', color: '#1967D2', bg: '#E8F0FE' },
  IN_EXECUTION:           { label: '执行中', color: '#246FE5', bg: '#E3F2FD' },
  AWAITING_PLAN_REVIEW:   { label: '方案审核中', color: '#1967D2', bg: '#E8F0FE' },
  IN_APPROVAL:            { label: '审批中', color: '#1967D2', bg: '#E8F0FE' },
  COMPLETED_LATE:         { label: '逾期完成', color: '#34C759', bg: '#EAFAF0' },
  COMPLETED_ON_TIME:      { label: '按时完成', color: '#27B050', bg: '#EAFAF0' },
  TERMINATED_ABNORMALLY:  { label: '异常终止', color: '#999999', bg: '#F5F5F5' },
  DELETED:                { label: '已删除', color: '#999999', bg: '#F5F5F5' },
}

const getTicketStatus = (t) => t?.workOrderState || ''

const getStatusInfo = (status) => {
  if (!status) return { label: '未知状态', color: '#999999', bg: '#F5F5F5' }
  return statusMap[status] || statusMap[status?.toUpperCase()] || { label: status, color: '#666', bg: '#F5F5F5' }
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 评分标签映射
const getScoreLabel = (score) => {
  const labels = { 1: '非常不满意', 2: '不满意', 3: '一般', 4: '满意', 5: '非常满意' }
  return labels[score] || '未评价'
}

// 评价标签映射
const tagLabelMap = {
  'TIMEOUT_HANDLE': '处理超时',
  'TIMELY_HANDLE': '处理及时',
  'ON_TIME_VISIT': '按时上门',
  'GOOD_ATTITUDE': '态度良好',
  'PROFESSIONAL': '专业高效'
}
const getTagLabel = (tag) => tagLabelMap[tag] || tag

const isDirectMediaUrl = (value) => {
  if (!value || typeof value !== 'string') return false
  return /^(https?:)?\/\//i.test(value) || value.startsWith('blob:') || value.startsWith('data:') || value.startsWith('/')
}

const sanitizeMediaUrl = (value) => {
  if (!value || typeof value !== 'string') return ''
  return isDirectMediaUrl(value) ? encodeURI(value) : ''
}

const toImageItem = (src, raw) => ({
  src: sanitizeMediaUrl(src),
  raw,
  failed: !sanitizeMediaUrl(src)
})

// 获取文件下载URL
const getFileUrl = async (fileId) => {
  try {
    console.log('Getting file URL for:', fileId)
    const res = await fetch('/dtp-file-server/file/initFileDownload?groupCode=TYXN&appId=global', {
      method: 'POST',
      headers: chatStore.getApiHeaders(),
      body: JSON.stringify({ fileId })
    })
    const data = await res.json()
    console.log('File download response:', JSON.stringify(data, null, 2))
    if (data.code === '00000' && data.data) {
      const url = typeof data.data === 'string'
        ? data.data
        : (data.data.fileUrl || data.data.url || data.data.downloadUrl || data.data.absolutePath || data.data.minioFileUrl || data.data.path || '')
      console.log('Got file URL:', url)
      return sanitizeMediaUrl(url)
    }
    console.log('Failed to get file URL, response code:', data.code, 'data:', data.data)
    return ''
  } catch (e) {
    console.error('Failed to get file URL:', fileId, e)
    return ''
  }
}

const resolveImageItem = async (item) => {
  if (!item) return toImageItem('', item)

  if (typeof item === 'object') {
    const directUrl = item.minioFileUrl || item.absolutePath || item.fileUrl || item.url || item.pic || ''
    if (directUrl) {
      return toImageItem(directUrl, item)
    }
    if (item.key) {
      const fileUrl = await getFileUrl(item.key)
      return toImageItem(fileUrl, item)
    }
    return toImageItem('', item)
  }

  if (typeof item === 'string') {
    if (isDirectMediaUrl(item)) {
      return toImageItem(item, item)
    }
    const fileUrl = await getFileUrl(item)
    return toImageItem(fileUrl, item)
  }

  return toImageItem('', item)
}

const resolveImageItems = async (items = []) => {
  const resolved = await Promise.all(items.map(resolveImageItem))
  return resolved.filter(item => item.src || item.failed)
}

const fetchTicketDetail = async () => {
  isLoading.value = true
  error.value = ''
  try {
    const res = await fetch(`/fm-workorder-server/repair/detail?orderId=${apiOrderId.value}`, {
      method: 'GET',
      headers: chatStore.getApiHeaders()
    })
    const data = await res.json()
    console.log('工单详情原始数据:', data)
    
    if (data.code === '00000' && data.data) {
      ticket.value = data.data
      
      // 处理图片URL - 支持对象形式（含 minioFileUrl）和字符串形式
      if (data.data.descriptionImageUrls?.length) {
        console.log('原始描述图片数据:', data.data.descriptionImageUrls)
        const images = await resolveImageItems(data.data.descriptionImageUrls)
        ticket.value.descriptionImageUrls = images
        console.log('处理后的描述图片URLs:', images)
      }
      
      if (data.data.executionImageUrls?.length) {
        console.log('原始处理图片数据:', data.data.executionImageUrls)
        const images = await resolveImageItems(data.data.executionImageUrls)
        ticket.value.executionImageUrls = images
        console.log('处理后的处理图片URLs:', images)
      }
      
      // 处理视频URL
      if (data.data.descriptionVideos?.length) {
        for (const video of data.data.descriptionVideos) {
          if (video.minioFileUrl) {
            video.absolutePath = video.minioFileUrl
          } else if (video.key && !video.absolutePath) {
            video.absolutePath = await getFileUrl(video.key)
          }
        }
      }
      if (data.data.executionVideos?.length) {
        for (const video of data.data.executionVideos) {
          if (video.minioFileUrl) {
            video.absolutePath = video.minioFileUrl
          } else if (video.key && !video.absolutePath) {
            video.absolutePath = await getFileUrl(video.key)
          }
        }
      }
    } else {
      error.value = data.message || '加载失败'
    }
  } catch (e) {
    error.value = '网络异常，请重试'
  } finally {
    isLoading.value = false
  }
}

const fetchRecords = async () => {
  try {
    const res = await fetch(`/fm-workorder-server/repair/process-record?orderId=${apiOrderId.value}`, {
      method: 'POST',
      headers: chatStore.getApiHeaders(),
      body: JSON.stringify({ orderId: apiOrderId.value })
    })
    const data = await res.json()
    if (data.code === '00000' && data.data) {
      records.value = data.data.records || data.data || []
    }
  } catch (e) {
    console.error('fetchRecords error', e)
  }
}

const handleRecordTabChange = (key) => {
  recordTab.value = key
  records.value = []
  fetchRecords()
}

// 打开流程面板
const openProcessPanel = async () => {
  showProcessPanel.value = true
  if (processRecords.value.length === 0) {
    await fetchProcessRecords()
  }
}

// 关闭流程面板
const closeProcessPanel = () => {
  showProcessPanel.value = false
}

// 获取流程记录
const fetchProcessRecords = async () => {
  isLoadingProcess.value = true
  try {
    const res = await fetch(`/fm-workorder-server/repair/process-record?orderId=${apiOrderId.value}`, {
      method: 'POST',
      headers: chatStore.getApiHeaders(),
      body: JSON.stringify({ orderId: apiOrderId.value })
    })
    const data = await res.json()
    if (data.code === '00000' && data.data) {
      processRecords.value = Array.isArray(data.data) ? data.data : []
    }
  } catch (e) {
    console.error('fetchProcessRecords error', e)
  } finally {
    isLoadingProcess.value = false
  }
}

// 处理图片加载错误
const handleImageError = (photo) => {
  console.error('Image load failed:', photo?.raw || photo?.src)
  if (photo) {
    photo.failed = true
  }
}

const openImageViewer = (images, index) => {
  const availableImages = (images || []).filter(item => item?.src && !item.failed)
  const current = images?.[index]
  if (!current?.src || current.failed || availableImages.length === 0) return

  viewerImages.value = availableImages
  viewerIndex.value = Math.max(availableImages.findIndex(item => item.src === current.src), 0)
  showImageViewer.value = true
  document.body.style.overflow = 'hidden'
}

const closeImageViewer = () => {
  showImageViewer.value = false
  document.body.style.overflow = ''
}

const showPrevImage = () => {
  if (viewerImages.value.length <= 1) return
  viewerIndex.value = (viewerIndex.value - 1 + viewerImages.value.length) % viewerImages.value.length
}

const showNextImage = () => {
  if (viewerImages.value.length <= 1) return
  viewerIndex.value = (viewerIndex.value + 1) % viewerImages.value.length
}

onMounted(() => {
  fetchTicketDetail()
  fetchRecords()
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
})

// 使用真实数据
const displayTicket = computed(() => ticket.value || {})
const currentViewerImage = computed(() => viewerImages.value[viewerIndex.value] || null)
</script>

<template>
  <div class="detail-page">
    <!-- Header -->
    <div class="header">
      <div class="header-nav">
        <div class="back-btn" @click="router.back()">
          <img src="/icons/back.svg" alt="返回" />
        </div>
        <div class="header-title">工单详情</div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="error-state">
      <div class="error-icon">⚠️</div>
      <div class="error-text">{{ error }}</div>
      <button class="retry-btn" @click="fetchTicketDetail">重试</button>
    </div>

    <!-- Content -->
    <div v-else class="detail-body">
      <!-- 状态 Banner -->
      <div class="status-banner" @click="openProcessPanel">
        <div class="status-content">
          <div class="status-row">
            <span class="status-label">{{ getStatusInfo(getTicketStatus(displayTicket)).label }}</span>
            <span class="status-arrow">›</span>
          </div>
          <div class="status-time">{{ formatDate(displayTicket.updateTime) }}</div>
        </div>
      </div>

      <!-- 主内容区域 -->
      <div class="main-content">
        <!-- 工单信息卡片 -->
        <div class="info-card">
          <div class="card-title">工单信息</div>
          <div class="info-list">
            <div class="info-row">
              <span class="info-label">工单名称</span>
              <span class="info-value">{{ displayTicket.workOrderName || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">工单编号</span>
              <span class="info-value">{{ displayTicket.orderNumber || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">项目名称</span>
              <span class="info-value">{{ displayTicket.projectName || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">报事类型</span>
              <span class="info-value">{{ displayTicket.reportType || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">报事位置</span>
              <span class="info-value">{{ displayTicket.reportLocation || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">预约时间</span>
              <span class="info-value">{{ formatDate(displayTicket.scheduledTime) || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">期望完成时间</span>
              <span class="info-value">{{ formatDate(displayTicket.expectedCompletionTime) || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">报事人</span>
              <span class="info-value">{{ displayTicket.reporterName || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">联系电话</span>
              <span class="info-value">{{ displayTicket.contactPhone || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">创建人</span>
              <span class="info-value">{{ displayTicket.creatorName || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">创建时间</span>
              <span class="info-value">{{ formatDate(displayTicket.creationTime) || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">事项描述</span>
              <span class="info-value">{{ displayTicket.issueDescription || '-' }}</span>
            </div>
            <!-- 图片/视频 -->
            <div class="info-row photo-row" v-if="displayTicket.descriptionImageUrls?.length || displayTicket.descriptionVideos?.length">
              <span class="info-label">图片/视频</span>
            </div>
            <!-- 图片 -->
            <div class="photo-grid" v-if="displayTicket.descriptionImageUrls?.length">
              <div 
                v-for="(photo, idx) in displayTicket.descriptionImageUrls" 
                :key="idx"
                class="photo-item"
                :class="{ failed: photo.failed }"
                @click="openImageViewer(displayTicket.descriptionImageUrls, idx)"
              >
                <img v-if="photo.src && !photo.failed" :src="photo.src" alt="图片" @error="handleImageError(photo)" />
                <div v-else class="photo-fallback">图片加载失败</div>
              </div>
            </div>
            <!-- 视频 -->
            <div class="video-grid" v-if="displayTicket.descriptionVideos?.length">
              <div 
                v-for="(video, idx) in displayTicket.descriptionVideos" 
                :key="idx"
                class="video-item"
              >
                <video :src="video.absolutePath || video.pic" controls></video>
              </div>
            </div>
          </div>

          <!-- 执行结果（有数据时才显示） -->
          <template v-if="displayTicket.executionResult || displayTicket.executionImageUrls?.length">
            <!-- 执行结果分隔线 -->
            <div class="section-divider">
              <div class="divider-line"></div>
              <span class="divider-text">执行结果</span>
              <div class="divider-line"></div>
            </div>

            <!-- 处理反馈 -->
            <div class="feedback-section" v-if="displayTicket.executionResult">
              <div class="info-row">
                <span class="info-label">处理反馈</span>
              </div>
              <div class="feedback-content">
                {{ displayTicket.executionResult }}
              </div>
            </div>

            <!-- 处理图片/视频 -->
            <div class="info-row photo-row" v-if="displayTicket.executionImageUrls?.length || displayTicket.executionVideos?.length">
              <span class="info-label">图片/视频</span>
            </div>
            <!-- 处理图片 -->
            <div class="photo-grid" v-if="displayTicket.executionImageUrls?.length">
              <div 
                v-for="(photo, idx) in displayTicket.executionImageUrls" 
                :key="idx"
                class="photo-item"
                :class="{ failed: photo.failed }"
                @click="openImageViewer(displayTicket.executionImageUrls, idx)"
              >
                <img v-if="photo.src && !photo.failed" :src="photo.src" alt="处理图片" @error="handleImageError(photo)" />
                <div v-else class="photo-fallback">图片加载失败</div>
              </div>
            </div>
            <!-- 处理视频 -->
            <div class="video-grid" v-if="displayTicket.executionVideos?.length">
              <div 
                v-for="(video, idx) in displayTicket.executionVideos" 
                :key="idx"
                class="video-item"
              >
                <video :src="video.absolutePath || video.pic" controls></video>
              </div>
            </div>
          </template>

          <!-- 评价详情（有数据时才显示） -->
          <template v-if="displayTicket.evaluates && displayTicket.evaluates.length > 0">
            <!-- 评价详情分隔线 -->
            <div class="section-divider">
              <div class="divider-line"></div>
              <span class="divider-text">评价详情</span>
              <div class="divider-line"></div>
            </div>

            <!-- 评价详情 -->
            <div class="evaluation-card">
              <div class="eval-row">
                <span class="eval-label">服务满意度</span>
                <div class="eval-stars">
                  <img 
                    v-for="i in 5" 
                    :key="i"
                    :src="i <= (displayTicket.evaluates[0].score || 0) ? '/icons/star-filled.svg' : '/icons/star-empty.svg'"
                    class="star-icon"
                    alt="星"
                  />
                  <span class="eval-score-label">{{ getScoreLabel(displayTicket.evaluates[0].score) }}</span>
                </div>
              </div>
              <div class="eval-tags" v-if="displayTicket.evaluates[0].tags?.length">
                <span 
                  v-for="(tag, idx) in displayTicket.evaluates[0].tags" 
                  :key="idx"
                  class="eval-tag"
                >
                  {{ getTagLabel(tag) }}
                </span>
              </div>
              <div class="eval-content" v-if="displayTicket.evaluates[0].evaluate">
                {{ displayTicket.evaluates[0].evaluate }}
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 流程面板 -->
    <div v-if="showProcessPanel" class="process-panel-overlay" @click.self="closeProcessPanel">
      <div class="process-panel">
        <div class="panel-header">
          <span class="panel-title">工单进度</span>
          <span class="panel-close" @click="closeProcessPanel">×</span>
        </div>
        <div class="panel-body">
          <!-- 加载中 -->
          <div v-if="isLoadingProcess" class="panel-loading">
            <div class="loading-spinner"></div>
            <span>加载中...</span>
          </div>
          <!-- 流程列表 -->
          <div v-else class="process-timeline">
            <div 
              v-for="(item, index) in processRecords" 
              :key="index"
              class="timeline-item"
              :class="{ 
                'is-processed': item.isProcessed,
                'is-current': item.isCurrentNode 
              }"
            >
              <div class="timeline-dot">
                <span v-if="item.isProcessed" class="dot-check">✓</span>
              </div>
              <div class="timeline-content">
                <div class="timeline-title">{{ item.record }}</div>
                <div v-if="item.dateTime" class="timeline-time">{{ item.dateTime }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 图片查看器 -->
    <div v-if="showImageViewer" class="image-viewer-overlay" @click="closeImageViewer">
      <button
        v-if="viewerImages.length > 1"
        type="button"
        class="viewer-nav prev"
        @click.stop="showPrevImage"
      >
        ‹
      </button>

      <div class="image-viewer-dialog" @click.stop>
        <button type="button" class="viewer-close" @click="closeImageViewer">×</button>
        <img
          v-if="currentViewerImage?.src"
          :src="currentViewerImage.src"
          alt="预览图片"
          class="viewer-image"
        />
        <div class="viewer-count" v-if="viewerImages.length > 1">
          {{ viewerIndex + 1 }} / {{ viewerImages.length }}
        </div>
      </div>

      <button
        v-if="viewerImages.length > 1"
        type="button"
        class="viewer-nav next"
        @click.stop="showNextImage"
      >
        ›
      </button>
    </div>
  </div>
</template>

<style scoped>
.detail-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #F1F4F6;
}

/* ===== Header ===== */
.header {
  width: 375px;
  height: 90px;
  background: white;
  flex-shrink: 0;
}

.header-nav {
  width: 375px;
  height: 46px;
  position: relative;
  margin-top: 44px;
}

.back-btn {
  width: 44px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: absolute;
  left: 0;
  top: 0;
}

.back-btn img {
  width: 24px;
  height: 24px;
}

.header-title {
  width: 219px;
  height: 24px;
  position: absolute;
  left: 78px;
  top: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  color: #1B2129;
  font-family: 'PingFang SC', sans-serif;
}

/* ===== Loading / Error ===== */
.loading-state,
.error-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #8B949E;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 2px solid #EBEEF2;
  border-top-color: #246FE5;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.retry-btn {
  padding: 8px 20px;
  background-color: #246FE5;
  color: #FFFFFF;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

/* ===== Body ===== */
.detail-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* ===== Status Banner ===== */
.status-banner {
  width: 375px;
  height: 102px;
  background: #246FE5;
  position: relative;
  overflow: hidden;
}

.status-banner::before {
  content: '';
  width: 159px;
  height: 195px;
  position: absolute;
  left: -110px;
  top: -111px;
  background: white;
  border-radius: 9999px;
  opacity: 0.05;
}

.status-banner::after {
  content: '';
  width: 195px;
  height: 195px;
  position: absolute;
  left: -36px;
  top: -24px;
  background: white;
  border-radius: 9999px;
  opacity: 0.1;
}

.status-content {
  position: absolute;
  left: 32px;
  top: 12px;
  z-index: 1;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}

.status-label {
  font-size: 16px;
  font-weight: 600;
  color: white;
  font-family: 'PingFang SC', sans-serif;
}

.status-arrow {
  font-size: 16px;
  color: white;
}

.status-time {
  font-size: 14px;
  font-weight: 400;
  color: white;
  font-family: 'PingFang SC', sans-serif;
}

/* ===== Main Content ===== */
.main-content {
  position: relative;
  margin-top: -40px;
  padding: 0 16px;
  padding-bottom: 32px;
}

/* ===== Info Card ===== */
.info-card {
  background: white;
  border-radius: 8px 8px 0 0;
  padding: 0 16px;
  min-height: calc(100vh - 90px - 102px + 40px);
}

.card-title {
  height: 44px;
  display: flex;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: #424C59;
  border-bottom: 0.5px solid #E1E5EB;
}

/* ===== Info List ===== */
.info-list {
  padding: 4px 0;
}

.info-row {
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.info-row.photo-row {
  height: auto;
  padding: 4px 0 0;
}

.info-label {
  font-size: 14px;
  font-weight: 400;
  color: #8B949E;
  font-family: 'PingFang SC', sans-serif;
}

.info-value {
  font-size: 14px;
  font-weight: 400;
  color: #1B2129;
  text-align: right;
  font-family: 'PingFang SC', sans-serif;
}

/* ===== Photo Grid ===== */
.photo-grid {
  display: flex;
  gap: 6px;
  padding: 4px 0 12px;
  flex-wrap: wrap;
}

.photo-item {
  width: 72px;
  height: 72px;
  border-radius: 4px;
  overflow: hidden;
  background: #F7F9FA;
  border: 1px solid #F7F9FA;
  cursor: pointer;
}

.photo-item.failed {
  border-color: #E1E5EB;
}

.photo-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  box-sizing: border-box;
  color: #8B949E;
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
}

/* ===== Video Grid ===== */
.video-grid {
  display: flex;
  gap: 6px;
  padding: 4px 0 12px;
  flex-wrap: wrap;
}

.video-item {
  width: 72px;
  height: 72px;
  border-radius: 4px;
  overflow: hidden;
  background: #F7F9FA;
  border: 1px solid #F7F9FA;
}

.video-item video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ===== Section Divider ===== */
.section-divider {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin: 8px 0;
}

.divider-line {
  width: 115.5px;
  height: 1px;
  background: rgba(196, 201, 207, 0.3);
}

.divider-text {
  font-size: 14px;
  font-weight: 400;
  color: #C4C9CF;
  padding: 0 4px;
  font-family: 'PingFang SC', sans-serif;
}

/* ===== Feedback Section ===== */
.feedback-section {
  padding: 4px 0;
}

.feedback-content {
  font-size: 14px;
  font-weight: 400;
  color: #1B2129;
  line-height: 1.5;
  padding: 4px 0 12px;
  font-family: 'PingFang SC', sans-serif;
}

/* ===== Evaluation Card ===== */
.evaluation-card {
  background: linear-gradient(90deg, rgba(241, 244, 246, 0.8) 0%, rgba(241, 244, 246, 0.2) 100%);
  border-radius: 6px;
  padding: 8px 16px;
  margin-bottom: 16px;
}

.evaluation-card.empty-eval {
  padding: 16px;
  text-align: center;
}

.no-eval {
  font-size: 14px;
  color: #8B949E;
  font-family: 'PingFang SC', sans-serif;
}

.eval-row {
  padding: 4px 0;
}

.eval-label {
  font-size: 14px;
  font-weight: 400;
  color: #8B949E;
  display: block;
  margin-bottom: 8px;
  font-family: 'PingFang SC', sans-serif;
}

.eval-stars {
  display: flex;
  align-items: center;
  gap: 6px;
}

.star-icon {
  width: 22px;
  height: 22px;
}

.eval-score-label {
  font-size: 14px;
  font-weight: 400;
  color: #1B2129;
  margin-left: 8px;
  font-family: 'PingFang SC', sans-serif;
}

.eval-tags {
  display: flex;
  gap: 6px;
  padding: 8px 0;
}

.eval-tag {
  padding: 2px 6px;
  background: #D9EBFF;
  border-radius: 2px;
  font-size: 12px;
  font-weight: 400;
  color: #1B4ACC;
  font-family: 'PingFang SC', sans-serif;
}

.eval-content {
  font-size: 14px;
  font-weight: 400;
  color: #1B2129;
  line-height: 1.5;
  padding-top: 8px;
  font-family: 'PingFang SC', sans-serif;
}

/* ===== 流程面板 ===== */
.process-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.process-panel {
  width: 100%;
  background: white;
  border-radius: 16px 16px 0 0;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #E1E5EB;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: #1B2129;
  font-family: 'PingFang SC', sans-serif;
}

.panel-close {
  font-size: 24px;
  color: #8B949E;
  cursor: pointer;
  line-height: 1;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 16px;
}

.panel-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #8B949E;
  gap: 12px;
}

/* ===== 时间轴 ===== */
.process-timeline {
  display: flex;
  flex-direction: column;
}

.timeline-item {
  display: flex;
  align-items: flex-start;
  position: relative;
  padding-bottom: 24px;
}

.timeline-item:last-child {
  padding-bottom: 0;
}

.timeline-item:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 11px;
  top: 24px;
  width: 2px;
  height: calc(100% - 24px);
  background: #E1E5EB;
}

.timeline-item.is-processed:not(:last-child)::after {
  background: #246FE5;
}

.timeline-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #E1E5EB;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 12px;
}

.timeline-item.is-processed .timeline-dot {
  background: #246FE5;
}

.timeline-item.is-current .timeline-dot {
  background: #246FE5;
  box-shadow: 0 0 0 4px rgba(36, 111, 229, 0.2);
}

.dot-check {
  color: white;
  font-size: 14px;
  font-weight: 600;
}

.timeline-content {
  flex: 1;
  padding-top: 2px;
}

.timeline-title {
  font-size: 15px;
  font-weight: 400;
  color: #8B949E;
  font-family: 'PingFang SC', sans-serif;
}

.timeline-item.is-processed .timeline-title {
  color: #1B2129;
  font-weight: 500;
}

.timeline-time {
  font-size: 13px;
  color: #8B949E;
  margin-top: 4px;
  font-family: 'PingFang SC', sans-serif;
}

/* ===== 图片查看器 ===== */
.image-viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(0, 0, 0, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
}

.image-viewer-dialog {
  position: relative;
  max-width: min(100%, 680px);
  max-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.viewer-image {
  max-width: 100%;
  max-height: calc(100vh - 120px);
  display: block;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}

.viewer-close {
  position: absolute;
  top: -48px;
  right: 0;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  color: #FFFFFF;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
}

.viewer-count {
  position: absolute;
  left: 50%;
  bottom: -40px;
  transform: translateX(-50%);
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: #FFFFFF;
  font-size: 12px;
}

.viewer-nav {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  color: #FFFFFF;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}

.viewer-nav.prev {
  margin-right: 16px;
}

.viewer-nav.next {
  margin-left: 16px;
}
</style>
