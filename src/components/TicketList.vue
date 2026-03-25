<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import { storeToRefs } from 'pinia'

const router = useRouter()
const chatStore = useChatStore()
const { userPhone } = storeToRefs(chatStore)

// 筛选 Tab
const activeTab = ref('ALL')
const tabs = [
  { key: 'ALL', label: '全部' },
  { key: 'PROCESSING', label: '处理中' },
  { key: 'WAIT_EVALUATE', label: '待评价' }
]

// 搜索
const searchKeyword = ref('')
const isSearchFocused = ref(false)

// 数据
const tickets = ref([])
const isLoading = ref(false)
const isEmpty = ref(false)
const hasMore = ref(true)
const apiError = ref('')

// 下拉刷新
const isRefreshing = ref(false)
const pullStartY = ref(0)
const pullDistance = ref(0)
const isPulling = ref(false)
const REFRESH_THRESHOLD = 60

// 处理中状态码（执行中、方案审核中、审批中）
const PROCESSING_STATUS_CODES = [5, 6, 7, '5', '6', '7']

// 状态映射（根据实际接口返回）
const statusMap = {
  // 数字状态码映射（API 实际返回数字字符串）
  1:  { label: '抢单中', bg: '#E8ECF0', color: '#424C59' },
  2:  { label: '抢单中', bg: '#E8ECF0', color: '#424C59' },  // 实际返回
  3:  { label: '指派中', bg: '#E8ECF0', color: '#424C59' },
  4:  { label: '待接单', bg: '#E8ECF0', color: '#424C59' },
  5:  { label: '执行中', bg: '#D9EBFF', color: '#1B4ACC' },
  6:  { label: '方案审核中', bg: '#D9EBFF', color: '#1B4ACC' },
  7:  { label: '审批中', bg: '#D9EBFF', color: '#1B4ACC' },
  8:  { label: '逾期完成', bg: '#E8ECF0', color: '#424C59' },
  9:  { label: '按时完成', bg: '#E8ECF0', color: '#424C59' },
  10: { label: '异常终止', bg: '#E8ECF0', color: '#424C59' },
  11: { label: '已删除', bg: '#E8ECF0', color: '#424C59' },
  // 字符串枚举值映射（兼容）
  GRAB_ORDERS:            { label: '抢单中', bg: '#E8ECF0', color: '#424C59' },
  ASSIGNMENT_IN_PROGRESS: { label: '指派中', bg: '#E8ECF0', color: '#424C59' },
  AWAITING_FOR_PICKUP:    { label: '待接单', bg: '#E8ECF0', color: '#424C59' },
  IN_EXECUTION:           { label: '执行中', bg: '#D9EBFF', color: '#1B4ACC' },
  AWAITING_PLAN_REVIEW:   { label: '方案审核中', bg: '#D9EBFF', color: '#1B4ACC' },
  IN_APPROVAL:            { label: '审批中', bg: '#D9EBFF', color: '#1B4ACC' },
  COMPLETED_LATE:         { label: '逾期完成', bg: '#E8ECF0', color: '#424C59' },
  COMPLETED_ON_TIME:      { label: '按时完成', bg: '#E8ECF0', color: '#424C59' },
  TERMINATED_ABNORMALLY:  { label: '异常终止', bg: '#E8ECF0', color: '#424C59' },
  DELETED:                { label: '已删除', bg: '#E8ECF0', color: '#424C59' },
}

const getStatusInfo = (status) => {
  if (!status) return { label: '未知状态', bg: '#E8ECF0', color: '#424C59' }
  return statusMap[status] || statusMap[status?.toUpperCase()] || { label: status, bg: '#E8ECF0', color: '#424C59' }
}

const getTicketTitle = (t) =>
  t.workOrderName || t.orderName || t.repairName || t.name || t.title ||
  t.orderTitle || t.reportTitle || '工单'

const getTicketStatus = (t) =>
  t.workOrderState || ''

const getLocation = (t) =>
  t.reportLocation || t.positionName || ''

const getReportTime = (t) =>
  t.creationTime || t.reportTime || t.createTime || ''

const getTypeName = (t) =>
  t.reportType || ''

const getFlowName = (t) =>
  t.workOrderProcess || t.flowName || t.processName || ''

// 高亮关键字
const highlightKeyword = (text) => {
  if (!text || !searchKeyword.value.trim()) return text
  const keyword = searchKeyword.value.trim()
  const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return text.replace(regex, '<span class="highlight">$1</span>')
}

// 过滤后的工单列表（只显示匹配关键字的）
const filteredTickets = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return tickets.value

  return tickets.value.filter(ticket => {
    const title = getTicketTitle(ticket).toLowerCase()
    const location = getLocation(ticket).toLowerCase()
    return title.includes(keyword) || location.includes(keyword)
  })
})

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  // 支持 ISO 8601 格式：2019-08-24T14:15:22.123Z
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const fetchTickets = async (reset = true) => {
  if (isLoading.value) return
  if (!hasMore.value && !reset) return

  isLoading.value = true
  if (reset) {
    tickets.value = []
    hasMore.value = true
    isEmpty.value = false
  }

  try {
    const payload = {
      creatorId: userPhone.value,
      size: 20,
      type: activeTab.value
    }
    if (searchKeyword.value.trim()) {
      payload.keyword = searchKeyword.value.trim()
    }

    console.log('[TicketList] request payload:', payload, 'phone:', userPhone.value)

    const res = await fetch('/fm-workorder-server/repair/list-page', {
      method: 'POST',
      headers: chatStore.getApiHeaders(),
      body: JSON.stringify(payload)
    })
    const data = await res.json()
    console.log('[TicketList] response:', data)

    if (data.code === '00000' && data.data) {
      // 接口返回 data 直接是数组
      let list = Array.isArray(data.data) ? data.data : (data.data.records || data.data.list || [])

      // 打印第一条数据的所有字段名，方便调试
      if (list.length > 0) {
        console.log('[TicketList] 第一条数据的字段名:', Object.keys(list[0]))
        console.log('[TicketList] 第一条数据内容:', list[0])
      }

      // 处理中页签：只保留执行中(5)、方案审核中(6)、审批中(7)状态
      if (activeTab.value === 'PROCESSING') {
        list = list.filter(t => PROCESSING_STATUS_CODES.includes(t.workOrderState))
      }

      apiError.value = ''
      if (reset) {
        tickets.value = list
      } else {
        tickets.value.push(...list)
      }
      const total = data.total ?? data.count ?? list.length
      hasMore.value = tickets.value.length < total
      isEmpty.value = tickets.value.length === 0
    } else {
      apiError.value = data.message || data.msg || `接口返回: ${data.code}`
      isEmpty.value = tickets.value.length === 0
    }
  } catch (e) {
    console.error('[TicketList] fetchTickets error', e)
    apiError.value = e.message || '网络异常'
    isEmpty.value = tickets.value.length === 0
  } finally {
    isLoading.value = false
  }
}

const handleTabChange = (key) => {
  activeTab.value = key
  searchKeyword.value = ''
  fetchTickets(true)
}

let searchTimer = null
const handleSearchInput = () => {
  // 搜索时不再调用 API，只在本地过滤
  // clearTimeout(searchTimer)
  // searchTimer = setTimeout(() => fetchTickets(true), 500)
}

const clearSearch = () => {
  searchKeyword.value = ''
  // fetchTickets(true)
}

const cancelSearch = () => {
  searchKeyword.value = ''
  isSearchFocused.value = false
  fetchTickets(true)
}

const handleSearchFocus = () => {
  isSearchFocused.value = true
}

const handleSearchBlur = () => {
  // 延迟隐藏，让取消按钮点击事件能触发
  setTimeout(() => {
    isSearchFocused.value = false
  }, 200)
}

const goToDetail = (ticket) => {
  router.push(`/ticket/${ticket.orderId}`)
}

const handleScroll = (e) => {
  const el = e.target
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) {
    fetchTickets(false)
  }
}

// 下拉刷新
const handleTouchStart = (e) => {
  const el = e.currentTarget
  if (el.scrollTop === 0) {
    pullStartY.value = e.touches[0].clientY
    isPulling.value = true
  }
}

const handleTouchMove = (e) => {
  if (!isPulling.value) return
  const currentY = e.touches[0].clientY
  pullDistance.value = Math.max(0, currentY - pullStartY.value)
}

const handleTouchEnd = async () => {
  if (!isPulling.value) return
  isPulling.value = false

  if (pullDistance.value >= REFRESH_THRESHOLD && !isRefreshing.value) {
    isRefreshing.value = true
    await fetchTickets(true)
    isRefreshing.value = false
  }
  pullDistance.value = 0
}

// 模拟数据用于设计核对
const mockTickets = [
  {
    orderId: '1',
    workOrderName: '5楼女卫生间马桶冲水按钮损坏',
    status: 'EXECUTING',
    reportIssueTypeName: '报事报修',
    flowName: '工单通用流程',
    reportTime: '2026-03-12 13:50:33',
    positionName: 'A座/F5/办公室B23'
  },
  {
    orderId: '2',
    workOrderName: '6楼男卫生间洗手台漏水',
    status: 'PENDING',
    reportIssueTypeName: '报事报修',
    flowName: '工单通用流程',
    reportTime: '2026-03-12 14:05:00',
    positionName: 'B座/F6/男卫生间'
  },
  {
    orderId: '3',
    workOrderName: '1楼大厅灯光不亮',
    status: 'RESOLVED',
    reportIssueTypeName: '报事报修',
    flowName: '工单通用流程',
    reportTime: '2026-03-11 09:20:45',
    positionName: 'A座/大厅'
  },
  {
    orderId: '4',
    workOrderName: '3楼电梯按钮失灵',
    status: 'PENDING',
    reportIssueTypeName: '报事报修',
    flowName: '工单通用流程',
    reportTime: '2026-03-12 15:30:22',
    positionName: 'B座/F3/电梯'
  },
  {
    orderId: '5',
    workOrderName: '3楼电梯按钮失灵',
    status: 'PENDING',
    reportIssueTypeName: '报事报修',
    flowName: '工单通用流程',
    reportTime: '2026-03-12 15:30:22',
    positionName: 'B座/F3/电梯'
  }
]

onMounted(() => {
  // 调用真实接口
  fetchTickets(true)
})
</script>

<template>
  <div class="ticket-list">
    <!-- 搜索框 -->
    <div class="search-bar">
      <div class="search-input-wrapper" :class="{ focused: isSearchFocused }">
        <img src="/icons/search.svg" class="search-icon" alt="搜索" />
        <input
          v-model="searchKeyword"
          type="text"
          placeholder="请输入搜索关键词"
          class="search-input"
          @input="handleSearchInput"
          @focus="handleSearchFocus"
          @blur="handleSearchBlur"
        />
        <span v-if="searchKeyword" class="search-clear" @click="clearSearch">×</span>
      </div>
      <span v-if="isSearchFocused" class="search-cancel" @click="cancelSearch">取消</span>
    </div>

    <!-- 筛选 Tab -->
    <div class="tab-bar">
      <div
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-item"
        :class="{ active: activeTab === tab.key }"
        @click="handleTabChange(tab.key)"
      >
        {{ tab.label }}
      </div>
    </div>

    <!-- 列表 -->
    <div
      class="list-body"
      @scroll="handleScroll"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
    >
      <!-- 下拉刷新提示 -->
      <div
        class="refresh-indicator"
        :style="{ height: pullDistance + 'px', opacity: Math.min(pullDistance / REFRESH_THRESHOLD, 1) }"
      >
        <span v-if="isRefreshing">刷新中...</span>
        <span v-else-if="pullDistance >= REFRESH_THRESHOLD">松开刷新</span>
        <span v-else>下拉刷新</span>
      </div>

      <!-- 加载中骨架 -->
      <template v-if="isLoading && tickets.length === 0">
        <div v-for="i in 4" :key="i" class="ticket-card skeleton">
          <div class="sk-line sk-title"></div>
          <div class="sk-tags">
            <div class="sk-tag"></div>
            <div class="sk-tag"></div>
          </div>
          <div class="sk-line sk-sub"></div>
          <div class="sk-line sk-sub"></div>
        </div>
      </template>

      <!-- 空态 -->
      <div v-else-if="isEmpty || filteredTickets.length === 0" class="empty-state">
        <img src="/image/empty.svg" class="empty-icon" alt="暂无内容" />
        <div class="empty-text">暂无内容</div>
      </div>

      <!-- 工单卡片列表 -->
      <template v-else>
        <div
          v-for="ticket in filteredTickets"
          :key="ticket.orderId || ticket.id"
          class="ticket-card"
          @click="goToDetail(ticket)"
        >
          <!-- 标题（支持关键字高亮） -->
          <div class="card-title" v-html="highlightKeyword(getTicketTitle(ticket))"></div>

          <!-- 标签行 -->
          <div class="card-tags">
            <span
              class="tag tag-status"
              :style="{ background: getStatusInfo(getTicketStatus(ticket)).bg, color: getStatusInfo(getTicketStatus(ticket)).color }"
            >{{ getStatusInfo(getTicketStatus(ticket)).label }}</span>
            <span v-if="getTypeName(ticket)" class="tag tag-type">{{ getTypeName(ticket) }}</span>
          </div>

          <!-- 信息行 -->
          <div class="card-info">
            <div class="info-row" v-if="getReportTime(ticket)">
              <span class="info-label">报事时间：</span>
              <span class="info-value">{{ formatDate(getReportTime(ticket)) }}</span>
            </div>
            <div class="info-row" v-if="getLocation(ticket)">
              <span class="info-label">报事位置：</span>
              <span class="info-value" v-html="highlightKeyword(getLocation(ticket))"></span>
            </div>
          </div>
        </div>

        <div v-if="isLoading" class="load-more">加载中...</div>
        <div v-else-if="!hasMore && filteredTickets.length > 0" class="load-more">已加载全部</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ticket-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #F1F4F6;
}

/* ===== 搜索框 ===== */
.search-bar {
  width: 100%;
  height: 42px;
  background: white;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 16px;
  box-sizing: border-box;
  gap: 12px;
}

.search-input-wrapper {
  flex: 1;
  height: 34px;
  background: #F7F9FA;
  border-radius: 20px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
}

.search-input-wrapper.focused {
  background: #F7F9FA;
}

.search-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
  font-family: 'PingFang SC', sans-serif;
  color: #1B2129;
  height: 22px;
  line-height: 22px;
}

.search-input::placeholder {
  color: #C4C9CF;
  font-family: 'PingFang SC', sans-serif;
}

.search-clear {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #8B949E;
  cursor: pointer;
  background: #E1E5EB;
  border-radius: 50%;
  line-height: 1;
}

.search-cancel {
  font-size: 14px;
  color: #626C78;
  font-family: 'PingFang SC', sans-serif;
  cursor: pointer;
  flex-shrink: 0;
}

/* 高亮关键字 */
.card-title :deep(.highlight),
.info-value :deep(.highlight) {
  color: #246FE5;
}

/* ===== Tab Bar ===== */
.tab-bar {
  width: 100%;
  height: 46px;
  background: #F1F4F6;
  display: flex;
  align-items: flex-start;
  padding: 8px 16px;
  gap: 6px;
  flex-shrink: 0;
  overflow-x: auto;
  box-sizing: border-box;
}

.tab-bar::-webkit-scrollbar {
  display: none;
}

.tab-item {
  height: 30px;
  padding: 0 12px;
  font-size: 14px;
  font-family: 'PingFang SC', sans-serif;
  color: #2E3742;
  font-weight: 400;
  background: #E8ECF0;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s;
}

.tab-item.active {
  color: #246FE5;
  font-weight: 600;
  background: white;
}

/* ===== List Body ===== */
.list-body {
  width: 100%;
  flex: 1;
  overflow-y: auto;
  padding: 0 16px;
  padding-bottom: 32px;
  -webkit-overflow-scrolling: touch;
  box-sizing: border-box;
  position: relative;
}

/* 下拉刷新 */
.refresh-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #8B949E;
  overflow: hidden;
  transition: height 0.2s;
}

/* ===== Ticket Card ===== */
.ticket-card {
  width: 100%;
  height: 113px;
  background: white;
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
}

.ticket-card:first-child {
  margin-top: 0;
}

/* ===== 标题 ===== */
.card-title {
  height: 31px;
  padding: 0 16px;
  padding-top: 8px;
  font-size: 15px;
  font-family: 'PingFang SC', sans-serif;
  font-weight: 600;
  color: #2E3742;
  line-height: 23px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-sizing: border-box;
}

/* ===== 标签行 ===== */
.card-tags {
  height: 26px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  box-sizing: border-box;
}

.tag {
  height: 20px;
  padding: 0 6px;
  font-size: 12px;
  font-family: 'PingFang SC', sans-serif;
  font-weight: 400;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

.tag-status {
  background: #D9EBFF;
  color: #1B4ACC;
}

.tag-type {
  background: #E8ECF0;
  color: #424C59;
}

.tag-flow {
  background: #E8ECF0;
  color: #424C59;
}

/* ===== 信息行 ===== */
.card-info {
  padding: 6px 16px 0;
  box-sizing: border-box;
}

.info-row {
  height: 21px;
  display: flex;
  align-items: center;
  font-size: 13px;
  font-family: 'PingFang SC', sans-serif;
  font-weight: 400;
  line-height: 21px;
}

.info-label {
  flex-shrink: 0;
  color: #626C78;
}

.info-value {
  color: #626C78;
}

/* ===== 空态 ===== */
.empty-state {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding-top: 265px;
}

.empty-icon {
  width: 90px;
  height: 76px;
  margin-bottom: 8px;
}

.empty-text {
  font-size: 14px;
  font-family: 'PingFang SC', sans-serif;
  font-weight: 400;
  color: #8B949E;
  text-align: center;
}
.empty-error { font-size: 12px; color: #FF3B30; padding: 0 16px; text-align: center; }
.empty-hint { font-size: 14px; color: #246FE5; cursor: pointer; padding: 4px 16px; }

/* ===== 底部加载更多 ===== */
.load-more {
  text-align: center;
  font-size: 13px;
  color: #AAAAAA;
  padding: 16px 0;
}

/* ===== Skeleton ===== */
.skeleton { pointer-events: none; }

.sk-line {
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
  margin-bottom: 10px;
}

.sk-title { width: 75%; height: 18px; }
.sk-tags { display: flex; gap: 6px; margin-bottom: 10px; }
.sk-tag { width: 60px; height: 22px; border-radius: 4px; background: #f0f0f0; animation: shimmer 1.5s infinite; background-size: 200% 100%; background-image: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%); }
.sk-sub { width: 55%; height: 14px; }

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
