<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import { storeToRefs } from 'pinia'
import { convertToJpeg } from '@/utils/imageUtils'
import { showToast } from '@/utils/toast'

const chatStore = useChatStore()
const { userPhone, bfListData, reportDraft } = storeToRefs(chatStore)
const getFixedIssueType = () => ({
  id: chatStore.fixedReportIssueTypeId,
  name: chatStore.fixedReportIssueTypeName
})

// ========== Form Data ==========
const description = ref('')
const reporter = ref('')
const appointmentTime = ref('')

// Location picker state
const selectedBuilding = ref(null)
const selectedFloor = ref(null)

const locationDisplay = computed(() => {
  if (selectedBuilding.value && selectedFloor.value) {
    if (selectedBuilding.value.id === selectedFloor.value.id) {
      return selectedBuilding.value.localName
    }
    return `${selectedBuilding.value.localName}/${selectedFloor.value.localName}`
  }
  return reportDraft.value.positionName || reportDraft.value.spaceName || reportDraft.value.objName || ''
})

// Full-screen Tree Picker state
const showTreePicker = ref(false)
const treeSearchQuery = ref('')
const expandedNodes = ref(new Set())

// Initialize expanded state for the first level to make it look like the design
const initTree = () => {
  if (bfListData.value) {
    bfListData.value.forEach(node => {
      expandedNodes.value.add(node.id)
    })
  }
}

const toggleNode = (node) => {
  if (expandedNodes.value.has(node.id)) {
    expandedNodes.value.delete(node.id)
  } else {
    expandedNodes.value.add(node.id)
  }
}

// Filter tree based on search
const filteredTreeData = computed(() => {
  if (!treeSearchQuery.value) return bfListData.value || []
  
  const query = treeSearchQuery.value.toLowerCase()
  
  // Deep clone and filter helper
  const filterNode = (node) => {
    const isMatch = node.localName.toLowerCase().includes(query)
    
    if (node.children && node.children.length > 0) {
      const filteredChildren = node.children
        .map(filterNode)
        .filter(child => child !== null)
      
      if (filteredChildren.length > 0 || isMatch) {
         // Auto expand if matched by search
         expandedNodes.value.add(node.id)
         return { ...node, children: filteredChildren }
      }
    }
    
    return isMatch ? { ...node, children: [] } : null
  }
  
  return (bfListData.value || [])
    .map(filterNode)
    .filter(node => node !== null)
})

const openTreePicker = () => {
  if (!bfListData.value || bfListData.value.length === 0) {
    showToast('数据加载中，请稍后重试')
    return
  }
  treeSearchQuery.value = ''
  initTree()
  showTreePicker.value = true
}

const selectTreeNode = async (node, parentBuilding) => {
  // If it's a leaf node or we are forcing selection on a middle node
  selectedBuilding.value = parentBuilding || node
  selectedFloor.value = node
  showTreePicker.value = false
  
  // 演示环境固定报事类型，不再请求全量类型树
  selectedIssueType.value = getFixedIssueType()
  issueTypes.value = []
}

// Issue type state
const issueTypes = ref([])
const selectedIssueType = ref(getFixedIssueType())
const issueTypeDisplay = computed(() => selectedIssueType.value?.name || '')
const isIssueTypeLoading = ref(false)

// Image upload state
const uploadedImages = ref([]) // { fileId, fileName, fileUrl, previewUrl }
const fileInput = ref(null)
const isUploading = ref(false)

// Picker modal control
const showPicker = ref(false)
const pickerType = ref('') // 'building', 'floor', 'issueType', 'issueTypeChild'
const pickerTitle = ref('')
const pickerOptions = ref([])
const parentIssueType = ref(null) // For two-level issue type

// Datetime wheel picker state
const showDatePicker = ref(false)
const dtYear = ref([])
const dtMonth = ref([])
const dtDay = ref([])
const dtHour = ref([])
const dtMinute = ref([])
const dtSelYear = ref(0)
const dtSelMonth = ref(0)
const dtSelDay = ref(0)
const dtSelHour = ref(0)
const dtSelMinute = ref(0)
const ITEM_HEIGHT = 40

// Generate picker data
function initDateColumns() {
  const now = new Date()
  const curYear = now.getFullYear()
  dtYear.value = Array.from({ length: 5 }, (_, i) => curYear + i)
  dtMonth.value = Array.from({ length: 12 }, (_, i) => i + 1)
  dtHour.value = Array.from({ length: 24 }, (_, i) => i)
  dtMinute.value = Array.from({ length: 60 }, (_, i) => i)

  dtSelYear.value = dtYear.value.indexOf(curYear)
  dtSelMonth.value = now.getMonth()
  updateDays()
  dtSelDay.value = now.getDate() - 1  // 0-indexed
  dtSelHour.value = now.getHours()
  dtSelMinute.value = now.getMinutes()
}

function updateDays() {
  const y = dtYear.value[dtSelYear.value] || new Date().getFullYear()
  const m = dtMonth.value[dtSelMonth.value] || 1
  const maxDay = new Date(y, m, 0).getDate()
  dtDay.value = Array.from({ length: maxDay }, (_, i) => i + 1)
  if (dtSelDay.value >= maxDay) dtSelDay.value = maxDay - 1
}

watch([dtSelYear, dtSelMonth], () => updateDays())

const appointmentDisplay = computed(() => {
  if (!appointmentTime.value) return ''
  return appointmentTime.value
})

function openDatePicker() {
  initDateColumns()
  showDatePicker.value = true
  nextTick(() => {
    scrollColumnTo('year', dtSelYear.value, false)
    scrollColumnTo('month', dtSelMonth.value, false)
    scrollColumnTo('day', dtSelDay.value, false)
    scrollColumnTo('hour', dtSelHour.value, false)
    scrollColumnTo('minute', dtSelMinute.value, false)
  })
}

function confirmDatePicker() {
  const y = dtYear.value[dtSelYear.value]
  const mo = String(dtMonth.value[dtSelMonth.value]).padStart(2, '0')
  const d = String(dtDay.value[dtSelDay.value]).padStart(2, '0')
  const h = String(dtHour.value[dtSelHour.value]).padStart(2, '0')
  const mi = String(dtMinute.value[dtSelMinute.value]).padStart(2, '0')
  appointmentTime.value = `${y}-${mo}-${d} ${h}:${mi}`
  showDatePicker.value = false
}

function cancelDatePicker() {
  showDatePicker.value = false
}

// Scroll-wheel touch/mouse handling
const wheelRefs = {}
const wheelState = {}

function getWheelEl(col) {
  return document.querySelector(`[data-wheel-col="${col}"]`)
}

function scrollColumnTo(col, index, smooth = true) {
  const el = getWheelEl(col)
  if (!el) return
  const top = index * ITEM_HEIGHT
  el.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
}

function onWheelScroll(col, event) {
  const el = event.target
  const index = Math.round(el.scrollTop / ITEM_HEIGHT)
  if (col === 'year') dtSelYear.value = Math.min(index, dtYear.value.length - 1)
  else if (col === 'month') dtSelMonth.value = Math.min(index, dtMonth.value.length - 1)
  else if (col === 'day') dtSelDay.value = Math.min(index, dtDay.value.length - 1)
  else if (col === 'hour') dtSelHour.value = Math.min(index, dtHour.value.length - 1)
  else if (col === 'minute') dtSelMinute.value = Math.min(index, dtMinute.value.length - 1)
}

// Debounced scroll handler
const scrollTimers = {}
function onWheelScrollDebounced(col, event) {
  clearTimeout(scrollTimers[col])
  scrollTimers[col] = setTimeout(() => {
    onWheelScroll(col, event)
    // Snap to nearest item
    const el = event.target
    const index = Math.round(el.scrollTop / ITEM_HEIGHT)
    el.scrollTo({ top: index * ITEM_HEIGHT, behavior: 'smooth' })
  }, 80)
}

// Submission state
const isSubmitting = ref(false)
let isApplyingDraft = false

const revokePreviewUrl = (url) => {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

const replaceUploadedImages = (nextImages = []) => {
  const nextIds = new Set(nextImages.map(image => image.fileId))
  uploadedImages.value.forEach(image => {
    if (!nextIds.has(image.fileId)) {
      revokePreviewUrl(image.previewUrl)
    }
  })
  uploadedImages.value = nextImages.map(image => ({ ...image }))
}

const buildLocationPatch = (building, floor) => {
  if (!building || !floor) {
    return {
      buildingId: '',
      buildingName: '',
      floorId: '',
      floorName: '',
      spaceId: '',
      spaceName: '',
      spaceType: '',
      objName: '',
      positionName: ''
    }
  }

  return {
    buildingId: building.id || '',
    buildingName: building.localName || '',
    floorId: floor.id || '',
    floorName: floor.localName || '',
    spaceId: floor.id || '',
    spaceName: floor.localName || '',
    spaceType: floor.spaceType || '',
    objName: floor.localName || '',
    positionName: building.id === floor.id
      ? (building.localName || '')
      : `${building.localName || ''}/${floor.localName || ''}`
  }
}

const findLocationNodes = (draft) => {
  if (!bfListData.value || bfListData.value.length === 0) {
    return { building: null, floor: null }
  }

  let building = null
  let floor = null

  if (draft.buildingId) {
    building = bfListData.value.find(item => item.id === draft.buildingId) || null
  }

  if (!building && draft.floorId) {
    building = bfListData.value.find(item => item.children?.some(child => child.id === draft.floorId)) || null
  }

  if (!building) {
    return { building: null, floor: null }
  }

  if (draft.floorId && building.children?.length) {
    floor = building.children.find(item => item.id === draft.floorId) || null
  }

  if (!floor) {
    floor = building
  }

  return { building, floor }
}

const applyDraftToForm = () => {
  isApplyingDraft = true
  const draft = reportDraft.value
  showDatePicker.value = false
  description.value = draft.description || ''
  reporter.value = draft.reporterName || ''
  appointmentTime.value = draft.appointmentTime || ''

  const { building, floor } = findLocationNodes(draft)
  selectedBuilding.value = building
  selectedFloor.value = floor
  selectedIssueType.value = getFixedIssueType()
  issueTypes.value = [selectedIssueType.value]

  replaceUploadedImages(chatStore.getCurrentDraftPhotos().map(image => ({
    fileId: image.fileId,
    fileName: image.fileName || '已上传图片',
    fileUrl: image.fileUrl || '',
    previewUrl: image.previewUrl || image.fileUrl || '',
    source: image.source || 'unknown'
  })))
  isApplyingDraft = false
}

const currentLocationPayload = computed(() => {
  if (selectedBuilding.value && selectedFloor.value) {
    return buildLocationPatch(selectedBuilding.value, selectedFloor.value)
  }

  return {
    buildingId: reportDraft.value.buildingId || '',
    buildingName: reportDraft.value.buildingName || '',
    floorId: reportDraft.value.floorId || '',
    floorName: reportDraft.value.floorName || '',
    spaceId: reportDraft.value.spaceId || '',
    spaceName: reportDraft.value.spaceName || reportDraft.value.objName || reportDraft.value.positionName || '',
    spaceType: reportDraft.value.spaceType || '',
    objName: reportDraft.value.objName || reportDraft.value.spaceName || reportDraft.value.positionName || '',
    positionName: reportDraft.value.positionName || reportDraft.value.spaceName || reportDraft.value.objName || ''
  }
})

// ========== Location Picker ==========
// Bottom Picker (Used only for Issue Types now)
const handlePickerSelect = async (option) => {
  if (pickerType.value === 'issueType') {
    // Check if this type has children
    if (option.raw.children && option.raw.children.length > 0) {
      parentIssueType.value = option.raw
      pickerType.value = 'issueTypeChild'
      pickerTitle.value = option.raw.name
      pickerOptions.value = option.raw.children.map(c => ({
        id: c.id,
        label: c.name,
        raw: c
      }))
    } else {
      selectedIssueType.value = option.raw
      showPicker.value = false
    }
  } else if (pickerType.value === 'issueTypeChild') {
    selectedIssueType.value = option.raw
    showPicker.value = false
  }
}

const closePicker = () => {
  showPicker.value = false
}

// ========== Issue Type ==========
const loadIssueTypes = async () => {
  selectedIssueType.value = getFixedIssueType()
  issueTypes.value = [selectedIssueType.value]
}

const openIssueTypePicker = () => {
  selectedIssueType.value = getFixedIssueType()
  showToast(`演示环境中报事类型固定为${chatStore.fixedReportIssueTypeName}`)
}

// ========== Image Upload ==========
const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleFileChange = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  if (uploadedImages.value.length >= 9) {
    showToast('最多上传9张图片')
    return
  }

  isUploading.value = true
  try {
    const uploadFile = await convertToJpeg(file)
    const uploadResult = await chatStore.uploadImage(uploadFile)

    // Create local preview URL
    const previewUrl = URL.createObjectURL(file)

    uploadedImages.value.push({
      fileId: uploadResult.fileId,
      fileName: uploadResult.fileName || uploadFile.name,
      fileUrl: uploadResult.fileUrl || '',
      previewUrl: previewUrl,
      source: 'traditional'
    })
  } catch (err) {
    showToast(`图片上传失败: ${err.message || '请重试'}`)
  } finally {
    isUploading.value = false
    event.target.value = ''
  }
}

const removeImage = (index) => {
  const img = uploadedImages.value[index]
  revokePreviewUrl(img.previewUrl)
  chatStore.removeReportDraftImage(img.fileId)
  uploadedImages.value.splice(index, 1)
}

// ========== Form Submission ==========
const canSubmit = computed(() => {
  return !!currentLocationPayload.value.positionName &&
         selectedIssueType.value &&
         description.value.trim().length > 0 &&
         !isSubmitting.value
})

const submitReport = async () => {
  if (!canSubmit.value) {
    if (!currentLocationPayload.value.positionName) {
      showToast('请选择报事位置')
    } else if (!selectedIssueType.value) {
      showToast('请选择报事类型')
    } else if (!description.value.trim()) {
      showToast('请输入事项描述')
    }
    return
  }

  isSubmitting.value = true
  try {
    const locationPayload = currentLocationPayload.value

    await chatStore.submitTraditionalReport({
      buildingId: locationPayload.buildingId,
      floorId: locationPayload.floorId,
      spaceId: locationPayload.spaceId,
      spaceName: locationPayload.spaceName,
      spaceType: locationPayload.spaceType,
      positionName: locationPayload.positionName,
      issueTypeId: chatStore.fixedReportIssueTypeId,
      description: description.value.trim(),
      photos: uploadedImages.value.map(img => img.fileId),
      appointmentTime: appointmentTime.value,
      reporter: reporter.value,
      phone: userPhone.value || '13880582649'
    })

    showToast('工单提交成功！')
    applyDraftToForm()
  } catch (err) {
    showToast(`提交失败: ${err.message}`)
  } finally {
    isSubmitting.value = false
  }
}

const resetForm = () => {
  chatStore.resetCurrentReportDraft()
  applyDraftToForm()
}

watch(
  [description, reporter, appointmentTime, selectedBuilding, selectedFloor],
  () => {
    if (isApplyingDraft) return
    chatStore.updateReportDraft({
      description: description.value,
      reporterName: reporter.value,
      appointmentTime: appointmentTime.value,
      ...(selectedBuilding.value && selectedFloor.value
        ? buildLocationPatch(selectedBuilding.value, selectedFloor.value)
        : {})
    })
  },
  { deep: true }
)

watch(
  uploadedImages,
  (images) => {
    if (isApplyingDraft) return
    chatStore.setReportDraftImages(images)
  },
  { deep: true }
)

watch(
  bfListData,
  () => {
    if (!selectedBuilding.value && (reportDraft.value.buildingId || reportDraft.value.positionName)) {
      applyDraftToForm()
    }
  },
  { deep: true }
)

// Prefill form from the shared draft so AI/非AI mode always stay in sync
onMounted(() => {
  loadIssueTypes()
  applyDraftToForm()
})
</script>

<template>
  <div class="traditional-report">
    <div class="form-section">
      <!-- Project -->
      <div class="form-item">
        <label class="required">所属项目</label>
        <div class="value-container">
          <span class="value">{{ reportDraft.projectName || '禹数2#楼(模拟演示项目)' }}</span>
        </div>
      </div>

      <!-- Location -->
      <div class="form-item" @click="openTreePicker">
        <label class="required">报事位置</label>
        <div class="value-container">
          <span :class="locationDisplay ? 'value' : 'placeholder'">
            {{ locationDisplay || '请选择' }}
          </span>
          <img src="/icons/arrow.svg" class="arrow-icon" />
        </div>
      </div>

      <!-- Type -->
      <div class="form-item" @click="openIssueTypePicker">
        <label class="required">报事类型</label>
        <div class="value-container">
          <span v-if="isIssueTypeLoading" class="placeholder">加载中...</span>
          <span v-else :class="issueTypeDisplay ? 'value' : 'placeholder'">
            {{ issueTypeDisplay || '请选择' }}
          </span>
          <img src="/icons/arrow.svg" class="arrow-icon" />
        </div>
      </div>

      <!-- Description -->
      <div class="form-item column">
        <label class="required">事项描述</label>
        <div class="textarea-container">
          <textarea 
            v-model="description" 
            placeholder="请输入" 
            maxlength="200"
            class="description-input"
          ></textarea>
          <span class="char-count">{{ description.length }}/200</span>
        </div>
      </div>

      <!-- Image/Video -->
      <div class="form-item column">
        <label>图片/视频</label>
        <div class="upload-area">
          <!-- Uploaded previews -->
          <div 
            v-for="(img, index) in uploadedImages" 
            :key="img.fileId"
            class="preview-box"
          >
            <img :src="img.previewUrl" class="preview-img" />
            <div class="remove-btn" @click="removeImage(index)">×</div>
          </div>
          <!-- Uploading indicator -->
          <div v-if="isUploading" class="upload-box uploading">
            <div class="upload-spinner"></div>
          </div>
          <!-- Add button -->
          <div 
            v-if="uploadedImages.length < 9 && !isUploading" 
            class="upload-box" 
            @click="triggerFileInput"
          >
            <img src="/icons/camera.svg" alt="Upload" class="camera-icon" />
          </div>
          <input 
            type="file" 
            accept="image/*" 
            ref="fileInput" 
            @change="handleFileChange" 
            style="display: none;" 
          />
        </div>
      </div>
    </div>

    <div class="form-section mt-12">
      <!-- Appointment Time -->
      <div class="form-item" @click="openDatePicker">
        <label>预约时间</label>
        <div class="value-container">
          <span :class="appointmentDisplay ? 'value' : 'placeholder'">
            {{ appointmentDisplay || '请选择' }}
          </span>
          <img src="/icons/arrow.svg" class="arrow-icon" />
        </div>
      </div>

      <!-- Reporter -->
      <div class="form-item">
        <label>报事人</label>
        <div class="value-container">
          <input v-model="reporter" type="text" placeholder="请输入" class="text-input" />
        </div>
      </div>

      <!-- Phone -->
      <div class="form-item no-border">
        <label class="required">联系电话</label>
        <div class="value-container">
          <span class="value">{{ reportDraft.phone || userPhone || '13880582649' }}</span>
        </div>
      </div>
    </div>

    <div class="submit-container">
      <button 
        class="submit-btn" 
        :class="{ disabled: !canSubmit }"
        :disabled="isSubmitting"
        @click="submitReport"
      >
        {{ isSubmitting ? '提交中...' : '提交' }}
      </button>
    </div>

    <!-- Bottom Picker Modal for Issue Type -->
    <Teleport to="body">
      <transition name="picker-fade">
        <div v-if="showPicker" class="picker-overlay" @click.self="closePicker">
          <transition name="picker-slide">
            <div v-if="showPicker" class="picker-panel">
              <div class="picker-header">
                <span class="picker-title">{{ pickerTitle }}</span>
                <span class="picker-close" @click="closePicker">取消</span>
              </div>
              <div class="picker-body">
                <div 
                  v-for="option in pickerOptions" 
                  :key="option.id"
                  class="picker-option"
                  @click="handlePickerSelect(option)"
                >
                  <span>{{ option.label }}</span>
                  <span v-if="option.raw.children && option.raw.children.length" class="option-arrow">›</span>
                </div>
                <div v-if="pickerOptions.length === 0" class="picker-empty">
                  暂无数据
                </div>
              </div>
            </div>
          </transition>
        </div>
      </transition>
    </Teleport>

    <!-- Full Screen Tree Picker Modal for Location -->
    <Teleport to="body">
      <transition name="slide-up">
        <div v-if="showTreePicker" class="tree-picker-modal">
          <div class="tree-header">
            <div class="tree-back-btn" @click="showTreePicker = false">
              <span class="arrow-left">‹</span>
            </div>
            <div class="tree-title">报事位置</div>
            <div class="tree-right-placeholder"></div>
          </div>
          
          <div class="tree-search-bar">
            <div class="search-input-wrapper">
              <span class="search-icon">🔍</span>
              <input 
                v-model="treeSearchQuery" 
                type="text" 
                placeholder="请输入搜索关键词" 
                class="tree-search-input"
              />
            </div>
          </div>

          <div class="tree-body">
            <!-- Recursive Tree Rendering inline (Max depth usually ~3) -->
            <div class="tree-list">
              <template v-for="level1 in filteredTreeData" :key="level1.id">
                <div class="tree-node depth-0">
                  <div class="tree-node-row" @click="toggleNode(level1)">
                    <span class="expand-icon" :class="{ expanded: expandedNodes.has(level1.id) }">
                      {{ level1.children && level1.children.length > 0 ? '▾' : '' }}
                    </span>
                    <label class="radio-label" @click.stop="selectTreeNode(level1, level1)">
                      <input 
                        type="radio" 
                        name="location" 
                        class="tree-radio" 
                        :checked="selectedFloor?.id === level1.id"
                      />
                      <span class="node-text">{{ level1.localName }}</span>
                    </label>
                  </div>
                  
                  <div v-if="expandedNodes.has(level1.id) && level1.children" class="tree-children">
                    <template v-for="level2 in level1.children" :key="level2.id">
                      <div class="tree-node depth-1">
                        <div class="tree-node-row" @click="toggleNode(level2)">
                          <span class="expand-icon" :class="{ expanded: expandedNodes.has(level2.id) }">
                            {{ level2.children && level2.children.length > 0 ? '▾' : '' }}
                          </span>
                          <label class="radio-label" @click.stop="selectTreeNode(level2, level1)">
                            <input 
                              type="radio" 
                              name="location" 
                              class="tree-radio" 
                              :checked="selectedFloor?.id === level2.id"
                            />
                            <span class="node-text">{{ level2.localName }}</span>
                          </label>
                        </div>

                        <div v-if="expandedNodes.has(level2.id) && level2.children" class="tree-children">
                          <template v-for="level3 in level2.children" :key="level3.id">
                            <div class="tree-node depth-2">
                              <div class="tree-node-row" @click="toggleNode(level3)">
                                <span class="expand-icon" :class="{ expanded: expandedNodes.has(level3.id) }">
                                  {{ level3.children && level3.children.length > 0 ? '▾' : '' }}
                                </span>
                                <label class="radio-label" @click.stop="selectTreeNode(level3, level1)">
                                  <input 
                                    type="radio" 
                                    name="location" 
                                    class="tree-radio" 
                                    :checked="selectedFloor?.id === level3.id"
                                  />
                                  <span class="node-text">{{ level3.localName }}</span>
                                </label>
                              </div>
                            </div>
                          </template>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>
              </template>
              
              <div v-if="filteredTreeData.length === 0" class="tree-empty">
                没有找到匹配的位置
              </div>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- DateTime Wheel Picker -->
    <Teleport to="body">
      <transition name="picker-fade">
        <div v-if="showDatePicker" class="picker-overlay" @click.self="cancelDatePicker">
          <transition name="picker-slide">
            <div v-if="showDatePicker" class="picker-panel dt-panel">
              <div class="picker-header">
                <span class="picker-close" @click="cancelDatePicker">取消</span>
                <span class="picker-title">选择时间</span>
                <span class="picker-confirm" @click="confirmDatePicker">确定</span>
              </div>
              <div class="dt-wheel-container">
                <!-- Highlight band -->
                <div class="dt-highlight"></div>
                <!-- Year -->
                <div class="dt-wheel" data-wheel-col="year" @scroll="onWheelScrollDebounced('year', $event)">
                  <div class="dt-wheel-padding"></div>
                  <div v-for="(v, i) in dtYear" :key="v" class="dt-wheel-item" :class="{ active: i === dtSelYear }">{{ v }}年</div>
                  <div class="dt-wheel-padding"></div>
                </div>
                <!-- Month -->
                <div class="dt-wheel" data-wheel-col="month" @scroll="onWheelScrollDebounced('month', $event)">
                  <div class="dt-wheel-padding"></div>
                  <div v-for="(v, i) in dtMonth" :key="v" class="dt-wheel-item" :class="{ active: i === dtSelMonth }">{{ String(v).padStart(2,'0') }}月</div>
                  <div class="dt-wheel-padding"></div>
                </div>
                <!-- Day -->
                <div class="dt-wheel" data-wheel-col="day" @scroll="onWheelScrollDebounced('day', $event)">
                  <div class="dt-wheel-padding"></div>
                  <div v-for="(v, i) in dtDay" :key="v" class="dt-wheel-item" :class="{ active: i === dtSelDay }">{{ String(v).padStart(2,'0') }}日</div>
                  <div class="dt-wheel-padding"></div>
                </div>
                <!-- Hour -->
                <div class="dt-wheel" data-wheel-col="hour" @scroll="onWheelScrollDebounced('hour', $event)">
                  <div class="dt-wheel-padding"></div>
                  <div v-for="(v, i) in dtHour" :key="v" class="dt-wheel-item" :class="{ active: i === dtSelHour }">{{ String(v).padStart(2,'0') }}时</div>
                  <div class="dt-wheel-padding"></div>
                </div>
                <!-- Minute -->
                <div class="dt-wheel" data-wheel-col="minute" @scroll="onWheelScrollDebounced('minute', $event)">
                  <div class="dt-wheel-padding"></div>
                  <div v-for="(v, i) in dtMinute" :key="v" class="dt-wheel-item" :class="{ active: i === dtSelMinute }">{{ String(v).padStart(2,'0') }}分</div>
                  <div class="dt-wheel-padding"></div>
                </div>
              </div>
            </div>
          </transition>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.traditional-report {
  flex: 1;
  background-color: #F1F4F6; /* Grey/Grey 100 */
  overflow-y: auto;
  padding-bottom: 80px;
}

.form-section {
  background-color: #FFFFFF;
  padding: 0 16px;
  margin: 12px 16px 0;
  border-radius: 8px;
}

.form-section:first-child {
  margin-top: 12px;
}

.mt-12 {
  margin-top: 12px;
}

.form-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  border-bottom: 0.5px solid #E1E5EB;
  font-size: 14px;
  cursor: pointer;
}

.form-item.column {
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  height: auto;
  padding: 16px 0;
  cursor: default;
}

.form-item.no-border,
.form-item:last-child {
  border-bottom: none;
}

label {
  color: #424C59; /* Grey/Grey 700 */
  font-weight: 400;
  white-space: nowrap;
}

label.required::before {
  content: '*';
  color: #FF3B30;
  margin-right: 4px;
}

.value-container {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: flex-end;
}

.value {
  color: #1B2129; /* Grey/Grey 900 */
}

.placeholder {
  color: #999999;
}

.arrow-icon {
  width: 16px;
  height: 16px;
}

.textarea-container {
  width: 100%;
  position: relative;
}

.description-input {
  width: 100%;
  height: 100px;
  border: none;
  resize: none;
  font-size: 14px;
  outline: none;
  padding: 0;
  color: #1B2129;
}

.description-input::placeholder {
  color: #C4C9CF; /* Grey/Grey 400 */
}

.char-count {
  position: absolute;
  bottom: 0;
  right: 0;
  font-size: 12px;
  color: #999999;
}

/* ===== Upload Area ===== */
.upload-area {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.upload-box {
  width: 80px;
  height: 80px;
  background-color: #F5F6FA;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.upload-box.uploading {
  cursor: default;
}

.upload-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #E1E5EB;
  border-top-color: #007AFF;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.camera-icon {
  width: 24px;
  height: 24px;
  opacity: 0.4;
}

.preview-box {
  width: 80px;
  height: 80px;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove-btn {
  position: absolute;
  top: 0;
  right: 0;
  width: 20px;
  height: 20px;
  background-color: rgba(0, 0, 0, 0.6);
  color: #FFFFFF;
  border-radius: 0 4px 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;
  line-height: 1;
}

/* ===== Datetime Wheel Picker ===== */
.dt-panel {
  max-height: 300px;
}

.dt-wheel-container {
  display: flex;
  position: relative;
  height: 200px;
  overflow: hidden;
}

.dt-highlight {
  position: absolute;
  top: 50%;
  left: 12px;
  right: 12px;
  height: 40px;
  transform: translateY(-50%);
  border-top: 0.5px solid #DDDDE0;
  border-bottom: 0.5px solid #DDDDE0;
  pointer-events: none;
  z-index: 1;
}

.dt-wheel {
  flex: 1;
  overflow-y: auto;
  scroll-snap-type: y mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.dt-wheel::-webkit-scrollbar {
  display: none;
}

.dt-wheel-padding {
  height: 80px; /* 2 * ITEM_HEIGHT to center the first/last items */
}

.dt-wheel-item {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  color: #BBBBBB;
  scroll-snap-align: start;
  transition: color 0.15s, font-weight 0.15s;
  user-select: none;
}

.dt-wheel-item.active {
  color: #333333;
  font-weight: 500;
}

.picker-confirm {
  font-size: 14px;
  color: #007AFF;
  cursor: pointer;
  font-weight: 500;
}

.text-input {
  border: none;
  text-align: right;
  font-size: 14px;
  outline: none;
  width: 100%;
  color: #1B2129;
}

.text-input::placeholder {
  color: #C4C9CF;
}

/* ===== Submit ===== */
.submit-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  background-color: #FFFFFF;
  border-top: 1px solid #E5E5E5;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}

.submit-btn {
  width: 100%;
  height: 44px;
  background-color: #246FE5; /* Palette/Blue/500 */
  color: #FFFFFF;
  border: none;
  border-radius: 8px;
  font-size: 14px; /* Matches style_NAKBKY */
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}

.submit-btn:active {
  opacity: 0.9;
}

.submit-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===== Picker Modal ===== */
.picker-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.picker-panel {
  width: 100%;
  background-color: #FFFFFF;
  border-radius: 12px 12px 0 0;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 0.5px solid #E1E5EB;
}

.picker-title {
  font-size: 16px;
  font-weight: 600;
  color: #333333;
}

.picker-close {
  font-size: 14px;
  color: #999999;
  cursor: pointer;
}

.picker-body {
  overflow-y: auto;
  flex: 1;
  -webkit-overflow-scrolling: touch;
}

.picker-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 0.5px solid #F0F0F0;
  font-size: 15px;
  color: #333333;
  cursor: pointer;
  transition: background-color 0.15s;
}

.picker-option:active {
  background-color: #F5F6FA;
}

.option-arrow {
  font-size: 18px;
  color: #CCCCCC;
}

.picker-empty {
  padding: 40px 16px;
  text-align: center;
  font-size: 14px;
  color: #999999;
}

/* ===== Picker Transitions ===== */
.picker-fade-enter-active,
.picker-fade-leave-active {
  transition: opacity 0.3s ease;
}
.picker-fade-enter-from,
.picker-fade-leave-to {
  opacity: 0;
}

.picker-slide-enter-active,
.picker-slide-leave-active {
  transition: transform 0.3s ease;
}
.picker-slide-enter-from,
.picker-slide-leave-to {
  transform: translateY(100%);
}
/* ===== Tree Picker (Full Screen) ===== */
.tree-picker-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #F5F6FA;
  z-index: 2000;
  display: flex;
  flex-direction: column;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}

.tree-header {
  height: 44px;
  background-color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 0.5px solid #E1E5EB;
  flex-shrink: 0;
}

.tree-back-btn {
  width: 40px;
  height: 44px;
  display: flex;
  align-items: center;
  cursor: pointer;
}

.arrow-left {
  font-size: 28px;
  color: #333333;
  line-height: 1;
  margin-top: -4px;
}

.tree-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
}

.tree-right-placeholder {
  width: 40px;
}

.tree-search-bar {
  padding: 12px 16px;
  background-color: #F5F6FA;
  flex-shrink: 0;
}

.search-input-wrapper {
  height: 36px;
  background-color: #FFFFFF;
  border-radius: 18px;
  display: flex;
  align-items: center;
  padding: 0 16px;
}

.search-icon {
  font-size: 14px;
  margin-right: 8px;
  color: #999999;
}

.tree-search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
  color: #333333;
}

.tree-search-input::placeholder {
  color: #999999;
}

.tree-body {
  flex: 1;
  overflow-y: auto;
  background-color: #FFFFFF;
  padding: 16px 16px 16px 8px;
  border-radius: 12px 12px 0 0;
}

.tree-list {
  display: flex;
  flex-direction: column;
}

.tree-node-row {
  display: flex;
  align-items: center;
  padding: 12px 0;
  cursor: pointer;
}

.expand-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: #999999;
  transition: transform 0.2s;
  flex-shrink: 0;
}

.expand-icon.expanded {
  transform: rotate(-90deg); /* Triangle default points down, rotate to point right if standard, or adjust based on symbol */
}
/* Adjusting since we use ▾ (down) by default */
.expand-icon { transform: rotate(-90deg); } /* Right */
.expand-icon.expanded { transform: rotate(0deg); } /* Down */

.radio-label {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  cursor: pointer;
}

.tree-radio {
  appearance: none;
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  border: 1.5px solid #CCCCCC;
  border-radius: 50%;
  outline: none;
  flex-shrink: 0;
  position: relative;
  margin: 0;
}

.tree-radio:checked {
  border-color: #007AFF;
}

.tree-radio:checked::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 10px;
  height: 10px;
  background-color: #007AFF;
  border-radius: 50%;
}

.node-text {
  font-size: 15px;
  color: #333333;
}

.tree-children {
  display: flex;
  flex-direction: column;
}

.tree-node.depth-1 .tree-node-row {
  padding-left: 24px;
}

.tree-node.depth-2 .tree-node-row {
  padding-left: 48px;
}

.tree-empty {
  padding: 40px 0;
  text-align: center;
  color: #999999;
  font-size: 14px;
}
</style>
