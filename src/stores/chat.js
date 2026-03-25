import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useChatStore = defineStore('chat', () => {
  const MAX_HISTORY_MESSAGES = 8
  const FIXED_REPORT_ISSUE_TYPE_ID = '5bf46aef58b242af83986c23944acfcd'
  const FIXED_REPORT_ISSUE_TYPE_NAME = '物品损坏报修'
  const currentSkill = ref('report') // 'report' or 'query'
  const messages = ref([])
  const isLoading = ref(false)
  const isRecording = ref(false)
  const inputMode = ref('voice')
  const isAiMode = ref(true)
  const _savedPhone = localStorage.getItem('userPhone') || '13880582649' // 测试用手机号
  const _savedToken = localStorage.getItem('userToken') || 'eyJhbGciOiJIUzI1NiJ9.eyJkZXZpY2VUeXBlIjoxLCJhdWQiOiJlbXMtc2Fhcy1jbGllbnQiLCJzdWIiOiJlbXMtdXNlciIsImFjY291bnRJZCI6IjE2OTIzMjIyNDM2NTgiLCJhY2NvdW50TmFtZSI6IuWtmeejiiIsInBob25lIjoiMTM4ODA1ODI2NDkiLCJpc3MiOiJlbXMiLCJqdGkiOiIwMzY1Mzk5My0yYjc5LTQ3NGItYWM1Yy03ZmNlNTA3NzUyYzIifQ._VeBNk7fMfYIBnJnuRFtQxh372kEEH60NPR5UkxaYWM' // 测试用 token
  const isLoggedIn = ref(!!(_savedPhone && _savedToken))
  const userPhone = ref(_savedPhone)
  const userToken = ref(_savedToken)
  const tenantData = ref(null)
  const bfListData = ref(null)
  const currentReportDraftId = ref(1)

  // 二维码上下文（登录后写入）
  const qrContext = ref({
    groupId: '',
    projectId: 'Pj9909990007',
    projectName: '禹数2#楼(模拟演示项目)',
    spaceId: '',
    spaceName: ''
  })
  const createEmptyReportDraft = () => ({
    projectId: qrContext.value.projectId || 'Pj9909990007',
    projectName: qrContext.value.projectName || '禹数2#楼(模拟演示项目)',
    buildingId: '',
    buildingName: '',
    floorId: '',
    floorName: '',
    spaceId: '',
    spaceName: '',
    spaceType: '',
    positionName: qrContext.value.spaceName || '',
    objName: '',
    issueTypeId: FIXED_REPORT_ISSUE_TYPE_ID,
    issueTypeName: FIXED_REPORT_ISSUE_TYPE_NAME,
    description: '',
    phone: userPhone.value || '',
    reporterName: '',
    appointmentTime: '',
    photos: []
  })
  const reportDraft = ref(createEmptyReportDraft())

  // 消息打断控制：记录当前正在进行的请求标识
  let currentRequestId = 0

  // ===== API Headers =====
  function getApiHeaders(includeContentType = true) {
    const headers = {
      'Token': userToken.value,
      'Group-Code': 'TYXN',
      'groupcode': 'TYXN',
      'Project-Id': 'Pj9909990007'
    }
    if (includeContentType) {
      headers['Content-Type'] = 'application/json'
    }
    return headers
  }

  function upsertCardDetail(cardData, label, value) {
    if (!Array.isArray(cardData.details)) {
      cardData.details = []
    }
    const existing = cardData.details.find(item => item.label === label)
    if (existing) {
      existing.value = value
      return
    }
    cardData.details.push({ label, value })
  }

  function normalizeReportCard(cardData) {
    if (!cardData || typeof cardData !== 'object') return cardData
    upsertCardDetail(cardData, '报事类型', FIXED_REPORT_ISSUE_TYPE_NAME)
    upsertCardDetail(cardData, '联系电话', userPhone.value || cardData.ticketPayload?.phone || '未填写')
    upsertCardDetail(cardData, '图片', reportDraft.value.photos.length > 0 ? '已上传' : '未上传')
    if (cardData.ticketPayload) {
      cardData.ticketPayload.issueTypeName = FIXED_REPORT_ISSUE_TYPE_NAME
      cardData.ticketPayload.phone = userPhone.value || cardData.ticketPayload.phone
    }
    return cardData
  }

  function normalizeDraftTextValue(value) {
    if (value == null) return ''
    const text = String(value).trim()
    if (!text || ['未填写', '未上传', '暂无', '-'].includes(text)) {
      return ''
    }
    return text
  }

  function getCardDetailValue(cardData, label) {
    return normalizeDraftTextValue(cardData?.details?.find(item => item?.label === label)?.value)
  }

  function resolveDraftPositionName(cardData, payload = {}) {
    const reportObj = payload.reportObj || {}
    const detailPosition = getCardDetailValue(cardData, '报事位置')
    const directPosition = normalizeDraftTextValue(payload.positionName)
    const reportObjPosition = normalizeDraftTextValue(reportObj.positionName)
    const composedPosition = [
      normalizeDraftTextValue(payload.buildingName || reportObj.buildingName),
      normalizeDraftTextValue(payload.floorName || reportObj.floorName),
      normalizeDraftTextValue(payload.spaceName || reportObj.spaceName || payload.objName || reportObj.objName)
    ].filter(Boolean).join('/')

    return detailPosition ||
      directPosition ||
      reportObjPosition ||
      composedPosition ||
      normalizeDraftTextValue(payload.spaceName || reportObj.spaceName) ||
      normalizeDraftTextValue(payload.objName || reportObj.objName) ||
      reportDraft.value.positionName
  }

  function normalizeDraftPhoto(photo) {
    if (!photo?.fileId) return null
    return {
      fileId: photo.fileId,
      fileName: photo.fileName || '已上传图片',
      fileUrl: photo.fileUrl || '',
      previewUrl: photo.previewUrl || photo.imageUrl || photo.fileUrl || '',
      source: photo.source || 'unknown'
    }
  }

  function refreshPendingReportCards() {
    const hasPhoto = reportDraft.value.photos.length > 0

    messages.value.forEach(message => {
      if (!message.isInfoCard && !message.isConfirmCard) return
      if (!message.cardData || typeof message.cardData !== 'object') {
        message.cardData = {}
      }

      upsertCardDetail(message.cardData, '所属项目', reportDraft.value.projectName || qrContext.value.projectName || '未填写')
      upsertCardDetail(message.cardData, '报事位置', reportDraft.value.positionName || '未填写')
      upsertCardDetail(message.cardData, '报事类型', FIXED_REPORT_ISSUE_TYPE_NAME)
      upsertCardDetail(message.cardData, '事项描述', reportDraft.value.description || '未填写')
      upsertCardDetail(message.cardData, '联系电话', reportDraft.value.phone || userPhone.value || '未填写')
      upsertCardDetail(message.cardData, '报事人', reportDraft.value.reporterName || '未填写')
      upsertCardDetail(message.cardData, '图片', hasPhoto ? '已上传' : '未上传')

      if (message.cardData.ticketPayload) {
        Object.assign(message.cardData.ticketPayload, {
          projectId: reportDraft.value.projectId || message.cardData.ticketPayload.projectId,
          projectName: reportDraft.value.projectName || message.cardData.ticketPayload.projectName,
          buildingId: reportDraft.value.buildingId || message.cardData.ticketPayload.buildingId,
          floorId: reportDraft.value.floorId || message.cardData.ticketPayload.floorId,
          spaceId: reportDraft.value.spaceId || message.cardData.ticketPayload.spaceId,
          spaceName: reportDraft.value.spaceName || message.cardData.ticketPayload.spaceName,
          spaceType: reportDraft.value.spaceType || message.cardData.ticketPayload.spaceType,
          positionName: reportDraft.value.positionName || message.cardData.ticketPayload.positionName,
          objName: reportDraft.value.objName || reportDraft.value.spaceName || message.cardData.ticketPayload.objName,
          issueTypeName: FIXED_REPORT_ISSUE_TYPE_NAME,
          description: reportDraft.value.description || message.cardData.ticketPayload.description,
          phone: reportDraft.value.phone || userPhone.value || message.cardData.ticketPayload.phone,
          reporterName: reportDraft.value.reporterName || message.cardData.ticketPayload.reporterName
        })
      }

      if (message.isConfirmCard) {
        message.cardData.hasPhoto = hasPhoto
      }
    })
  }

  function setReportDraftImages(photos = []) {
    const deduped = []
    const seen = new Set()

    photos.forEach(photo => {
      const normalized = normalizeDraftPhoto(photo)
      if (!normalized || seen.has(normalized.fileId)) return
      seen.add(normalized.fileId)
      deduped.push(normalized)
    })

    reportDraft.value = {
      ...reportDraft.value,
      photos: deduped
    }
    refreshPendingReportCards()
  }

  function addReportDraftImage(photo) {
    const normalized = normalizeDraftPhoto(photo)
    if (!normalized) return
    const existing = reportDraft.value.photos.find(item => item.fileId === normalized.fileId)
    if (existing) {
      Object.assign(existing, normalized)
      reportDraft.value = {
        ...reportDraft.value,
        photos: [...reportDraft.value.photos]
      }
      refreshPendingReportCards()
      return
    }
    setReportDraftImages([...reportDraft.value.photos, normalized])
  }

  function removeReportDraftImage(fileId) {
    if (!fileId) return
    setReportDraftImages(reportDraft.value.photos.filter(photo => photo.fileId !== fileId))
  }

  function updateReportDraft(patch = {}) {
    const nextDraft = {
      ...reportDraft.value,
      ...patch,
      issueTypeId: FIXED_REPORT_ISSUE_TYPE_ID,
      issueTypeName: FIXED_REPORT_ISSUE_TYPE_NAME,
      phone: userPhone.value || patch.phone || reportDraft.value.phone || ''
    }

    if (!nextDraft.projectId) {
      nextDraft.projectId = qrContext.value.projectId || 'Pj9909990007'
    }
    if (!nextDraft.projectName) {
      nextDraft.projectName = qrContext.value.projectName || '禹数2#楼(模拟演示项目)'
    }
    if (!nextDraft.positionName && nextDraft.buildingName && nextDraft.floorName) {
      nextDraft.positionName = nextDraft.buildingName === nextDraft.floorName
        ? nextDraft.buildingName
        : `${nextDraft.buildingName}/${nextDraft.floorName}`
    }

    reportDraft.value = nextDraft
    refreshPendingReportCards()
  }

  function resetCurrentReportDraft() {
    reportDraft.value = createEmptyReportDraft()
    refreshPendingReportCards()
  }

  function startNextReportDraft() {
    currentReportDraftId.value += 1
    resetCurrentReportDraft()
  }

  function getCurrentDraftPhotos() {
    return reportDraft.value.photos
  }

  function isActiveDraftPhoto(fileId) {
    return reportDraft.value.photos.some(photo => photo.fileId === fileId)
  }

  function getReportDraftSummary() {
    const summaryRows = [
      ['所属项目', reportDraft.value.projectName],
      ['报事位置', reportDraft.value.positionName],
      ['报事类型', reportDraft.value.issueTypeName],
      ['事项描述', reportDraft.value.description],
      ['联系电话', reportDraft.value.phone],
      ['报事人', reportDraft.value.reporterName],
      ['预约时间', reportDraft.value.appointmentTime],
      ['图片', reportDraft.value.photos.length > 0 ? '已上传' : '未上传']
    ]

    return summaryRows
      .filter(([, value]) => normalizeDraftTextValue(value))
      .map(([label, value]) => `${label}=${value}`)
      .join('；')
  }

  function syncReportDraftFromCard(cardData) {
    if (!cardData || typeof cardData !== 'object') return

    const payload = cardData.ticketPayload || {}
    const reportObj = payload.reportObj || {}
    updateReportDraft({
      projectId: payload.projectId || reportDraft.value.projectId,
      projectName: getCardDetailValue(cardData, '所属项目') || payload.projectName || reportDraft.value.projectName,
      buildingId: payload.buildingId || reportObj.buildingId || reportDraft.value.buildingId,
      buildingName: payload.buildingName || reportObj.buildingName || reportDraft.value.buildingName,
      floorId: payload.floorId || reportObj.floorId || reportDraft.value.floorId,
      floorName: payload.floorName || reportObj.floorName || reportDraft.value.floorName,
      spaceId: payload.spaceId || reportObj.spaceId || reportDraft.value.spaceId,
      spaceName: payload.spaceName || reportObj.spaceName || payload.objName || reportObj.objName || reportDraft.value.spaceName,
      spaceType: payload.spaceType || reportObj.spaceType || reportDraft.value.spaceType,
      positionName: resolveDraftPositionName(cardData, payload),
      objName: payload.objName || reportObj.objName || payload.spaceName || reportObj.spaceName || reportDraft.value.objName,
      description: getCardDetailValue(cardData, '事项描述') || payload.description || reportDraft.value.description,
      reporterName: getCardDetailValue(cardData, '报事人') || payload.reporterName || reportDraft.value.reporterName
    })
  }

  function getMessageDraftId(message) {
    return message?.reportDraftId ?? currentReportDraftId.value
  }

  function getCurrentDraftImageMessages() {
    return messages.value.filter(message =>
      message.type === 'user' &&
      message.fileId &&
      getMessageDraftId(message) === currentReportDraftId.value &&
      isActiveDraftPhoto(message.fileId)
    )
  }

  function clearPendingReportCards() {
    messages.value = messages.value.filter(message => !message.isInfoCard && !message.isConfirmCard)
  }

  function buildSubmitSuccessCardData(cardData, ticketData, uploadedPhotos) {
    const details = Array.isArray(cardData?.details)
      ? cardData.details.map(item => ({ ...item }))
      : [
          { label: '所属项目', value: ticketData.projectName || qrContext.value.projectName || '禹数2#楼(模拟演示项目)' },
          { label: '报事位置', value: ticketData.positionName || '未填写' },
          { label: '报事类型', value: FIXED_REPORT_ISSUE_TYPE_NAME },
          { label: '事项描述', value: ticketData.description || '未填写' },
          { label: '联系电话', value: ticketData.phone || userPhone.value || '未填写' },
          { label: '报事人', value: ticketData.reporterName || '未填写' },
          { label: '图片', value: uploadedPhotos.length > 0 ? '已上传' : '未上传' }
        ]

    const ensureDetail = (label, value) => {
      const existing = details.find(item => item.label === label)
      if (existing) {
        existing.value = value
      } else {
        details.push({ label, value })
      }
    }

    ensureDetail('报事类型', FIXED_REPORT_ISSUE_TYPE_NAME)
    ensureDetail('所属项目', ticketData.projectName || qrContext.value.projectName || '禹数2#楼(模拟演示项目)')
    ensureDetail('报事位置', ticketData.positionName || '未填写')
    ensureDetail('事项描述', ticketData.description || '未填写')
    ensureDetail('联系电话', ticketData.phone || userPhone.value || '未填写')
    ensureDetail('报事人', ticketData.reporterName || '未填写')
    ensureDetail('图片', uploadedPhotos.length > 0 ? '已上传' : '未上传')

    return {
      title: cardData?.title || '创建用户报事工单：',
      details
    }
  }

  // ===== 欢迎语（根据是否有位置上下文动态生成） =====
  function getWelcomeMessage(skill) {
    if (skill === 'report') {
      if (qrContext.value.spaceName) {
        return `您好，欢迎使用Ai用户报事，请告知具体问题～`
      } else {
        return `您好，欢迎使用Ai用户报事，请告知具体问题，由于未获取到当前位置，还需补充您当前所在位置，例如【A座5楼会议室B12d灯泡坏了】，这将大量的节约你的上报时间哦～～`
      }
    } else {
      return `您好，欢迎使用AI报事查询，可以这样问我：\n• 我上周在B3车位报的那个单现在到哪一步了？\n• 我今天提的报修有几个？分别什么状态？\n• 帮我找到"马桶冲水按钮损坏"那条报事的处理结果`
    }
  }

  // ===== Skill 切换 =====
  function switchSkill(skill) {
    currentSkill.value = skill
    isAiMode.value = true
    if (skill === 'report') {
      startNextReportDraft()
    }
    messages.value = [{
      id: Date.now(),
      type: 'system',
      content: getWelcomeMessage(skill),
      timestamp: null
    }]
  }

  // ===== 初始化上下文 =====
  async function initContext() {
    if (!userToken.value) return
    try {
      const response = await fetch('/dtp-rwd-server/rwd/work/order/bfList?groupCode=TYXN&projectId=Pj9909990007', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ asc: true })
      })
      const data = await response.json()
      if (data.code === '00000' && data.data) {
        bfListData.value = data.data
      }
    } catch (e) {
      console.error('Failed to init context bfList', e)
    }
  }

  // ===== 登录 =====
  function login(phone, token = '', tenant = null) {
    isLoggedIn.value = true
    userPhone.value = phone
    // 如果 token 为空，保留硬编码的默认 token
    if (token) {
      userToken.value = token
    }
    tenantData.value = tenant
    sessionStorage.setItem('userPhone', phone)
    if (token) {
      sessionStorage.setItem('userToken', token)
      localStorage.setItem('userToken', token)
    }
    localStorage.setItem('userPhone', phone)
    updateReportDraft({ phone })
    initContext()
  }

  // ===== 退出登录 =====
  function logout() {
    isLoggedIn.value = false
    userPhone.value = ''
    userToken.value = ''
    tenantData.value = null
    messages.value = []
    currentReportDraftId.value = 1
    resetCurrentReportDraft()
    sessionStorage.removeItem('userPhone')
    sessionStorage.removeItem('userToken')
    localStorage.removeItem('userPhone')
    localStorage.removeItem('userToken')
  }

  // ===== 构建发送给 AI 的消息历史 =====
  function buildHistory() {
    const draftSummary = getReportDraftSummary()
    const hasPhoto = getCurrentDraftPhotos().length > 0

    // 过滤出有内容的消息并转换角色，只保留最近几轮，避免历史无限增长
    const history = messages.value
      .filter(m => {
        if (!m.content || m.type === 'loading' || m.timestamp === null) return false
        if (currentSkill.value === 'report' && m.fileId) {
          return getMessageDraftId(m) === currentReportDraftId.value && isActiveDraftPhoto(m.fileId)
        }
        return true
      })
      .map(m => ({
        role: m.type === 'user' ? 'user' : 'assistant',
        content: m.content
      }))
      .slice(-MAX_HISTORY_MESSAGES)

    // 注入上下文
    let bfInfo = ''
    if (bfListData.value && bfListData.value.length > 0) {
      bfInfo = '可选楼栋：' + bfListData.value.slice(0, 2).map(b => b.localName).join('、')
    }

    const locationCtx = qrContext.value.spaceName
      ? `当前已识别位置：${qrContext.value.projectName} - ${qrContext.value.spaceName}`
      : `当前已识别项目：${qrContext.value.projectName || '未知'}，位置未确定`

    const contextParts = [
      `当前用户手机号=${userPhone.value}`,
      locationCtx,
      bfInfo,
      draftSummary ? `当前工单草稿：${draftSummary}` : '',
      hasPhoto ? '用户已上传现场图片' : '用户暂未上传现场图片'
    ].filter(Boolean)

    const contextMsg = {
      role: 'user',
      content: `[System Context: ${contextParts.join('。')}]`
    }
    history.unshift(contextMsg)
    return history
  }

  // ===== 发送消息（含打断机制） =====
  async function addMessage(msg) {
    const newMsg = {
      id: Date.now(),
      timestamp: new Date(),
      ...msg
    }
    if (newMsg.fileId && currentSkill.value === 'report' && newMsg.reportDraftId == null) {
      newMsg.reportDraftId = currentReportDraftId.value
      addReportDraftImage({
        fileId: newMsg.fileId,
        fileName: newMsg.fileName,
        fileUrl: newMsg.fileUrl,
        previewUrl: newMsg.imageUrl,
        source: 'ai'
      })
    }
    messages.value.push(newMsg)

    if (msg.type !== 'user') return

    // 打断：产生新的 requestId，旧请求的响应会被忽略
    currentRequestId++
    const thisRequestId = currentRequestId

    // 移除上一条加载中消息（如果有）
    messages.value = messages.value.filter(m => m.type !== 'loading')

    // 插入新的加载中消息
    const loadingMsgId = Date.now() + 1
    messages.value.push({
      id: loadingMsgId,
      type: 'loading',
      content: '',
      timestamp: new Date()
    })

    isLoading.value = true

    try {
      const history = buildHistory()

      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          skill: currentSkill.value,
          userPhone: userPhone.value,
          userToken: userToken.value
        })
      })

      // 如果已被更新的请求打断，丢弃此响应
      if (thisRequestId !== currentRequestId) return

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        // 特殊处理429限流错误
        if (response.status === 429) {
          throw new Error('AI服务繁忙，请稍后再试（请求频率过高）')
        }
        throw new Error(errData.detail || errData.error || `AI请求失败(${response.status})`)
      }

      const data = await response.json()
      let aiContent = data.choices?.[0]?.message?.content || '抱歉，系统暂时无法处理您的请求。'

      // 移除加载中消息
      messages.value = messages.value.filter(m => m.id !== loadingMsgId)

      if (thisRequestId !== currentRequestId) return

      // ===== 解析工单信息卡片（必填未齐全）=====
      if (aiContent.includes(':::INFO_CARD_START:::')) {
        const match = aiContent.match(/:::INFO_CARD_START:::([\s\S]*?):::INFO_CARD_END:::/)
        if (match) {
          let jsonStr = match[1].trim().replace(/^```[a-z]*\n/, '').replace(/\n```$/, '').trim()
          const textPart = aiContent.replace(match[0], '').trim()
          try {
            const cardData = JSON.parse(jsonStr)
            normalizeReportCard(cardData)
            syncReportDraftFromCard(cardData)
            // 强制将联系电话覆盖为当前登录手机号
            const phoneRow = cardData.details?.find(d => d.label === '联系电话')
            if (phoneRow) phoneRow.value = userPhone.value || phoneRow.value
            // 移除旧的同类卡片
            clearPendingReportCards()
            messages.value.push({
              id: Date.now() + 2,
              type: 'system',
              content: textPart,
              isInfoCard: true,
              cardData,
              timestamp: new Date()
            })
            return
          } catch (e) {
            console.error('Failed to parse INFO_CARD JSON', e)
          }
        }
      }

      // ===== 解析工单提交卡片（必填已齐全）=====
      if (aiContent.includes(':::CONFIRM_CARD_START:::')) {
        const match = aiContent.match(/:::CONFIRM_CARD_START:::([\s\S]*?):::CONFIRM_CARD_END:::/)
        if (match) {
          let jsonStr = match[1].trim().replace(/^```[a-z]*\n/, '').replace(/\n```$/, '').trim()
          const textPart = aiContent.replace(match[0], '').trim()
          try {
            const cardData = JSON.parse(jsonStr)
            normalizeReportCard(cardData)
            syncReportDraftFromCard(cardData)
            // 强制将联系电话覆盖为当前登录手机号（显示层和提交层都保证一致）
            const phoneRow = cardData.details?.find(d => d.label === '联系电话')
            if (phoneRow) phoneRow.value = userPhone.value || phoneRow.value
            if (cardData.ticketPayload) cardData.ticketPayload.phone = userPhone.value || cardData.ticketPayload.phone
            // 判断是否已上传图片
            const hasPhoto = getCurrentDraftPhotos().length > 0
            cardData.hasPhoto = hasPhoto
            upsertCardDetail(cardData, '图片', hasPhoto ? '已上传' : '未上传')
            // 移除旧的同类卡片
            clearPendingReportCards()
            messages.value.push({
              id: Date.now() + 2,
              type: 'system',
              content: textPart,
              isConfirmCard: true,
              cardData,
              timestamp: new Date()
            })
            return
          } catch (e) {
            console.error('Failed to parse CONFIRM_CARD JSON', e)
          }
        }
      }

      // 普通文本回复
      messages.value.push({
        id: Date.now() + 2,
        type: 'system',
        content: aiContent,
        timestamp: new Date()
      })

    } catch (error) {
      if (thisRequestId !== currentRequestId) return
      messages.value = messages.value.filter(m => m.id !== loadingMsgId)
      console.error('AI Processing Error:', error)
      messages.value.push({
        id: Date.now() + 2,
        type: 'system',
        content: '消息处理失败，请重试。',
        timestamp: new Date()
      })
    } finally {
      if (thisRequestId === currentRequestId) {
        isLoading.value = false
      }
    }
  }

  // ===== 图片上传 =====
  async function uploadImage(file) {
    const headers = getApiHeaders(false)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const uploadRes = await fetch('/mid-frame-server/upload/fms', {
        method: 'POST',
        headers,
        body: formData
      })
      const uploadData = await uploadRes.json()

      let fileKey = null
      if (uploadData && uploadData.data) {
        fileKey = typeof uploadData.data === 'string' ? uploadData.data : (uploadData.data.key || uploadData.data.id || uploadData.data.fileId)
      } else if (uploadData && (uploadData.key || uploadData.id || uploadData.fileId)) {
        fileKey = uploadData.key || uploadData.id || uploadData.fileId
      } else if (typeof uploadData === 'string') {
        fileKey = uploadData
      }

      if (!fileKey) throw new Error(`上传返回无法识别: ${JSON.stringify(uploadData)}`)

      const syncRes = await fetch('/mid-frame-server/synchronize/fms', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ key: fileKey })
      })
      await syncRes.json()

      let fileUrl = ''
      try {
        const dlRes = await fetch('/dtp-file-server/file/initFileDownload?groupCode=TYXN&appId=global', {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({ fileId: fileKey })
        })
        const dlData = await dlRes.json()
        if (dlData && dlData.data) {
          fileUrl = typeof dlData.data === 'string' ? dlData.data : (dlData.data.url || dlData.data.fileUrl || '')
        }
      } catch (dlErr) {
        console.warn('initFileDownload failed (non-critical):', dlErr)
      }

      return { fileId: fileKey, fileName: file.name, fileUrl }
    } catch (err) {
      console.error('Image upload pipeline failed:', err)
      throw err
    }
  }

  // ===== 工单提交 =====
  async function executeTicketCreation(cardData) {
    try {
      const ticketData = {
        ...(cardData?.ticketPayload || cardData || {}),
        ...reportDraft.value
      }
      const uploadedPhotos = getCurrentDraftPhotos().map(photo => photo.fileId)

      const reportIssueType = FIXED_REPORT_ISSUE_TYPE_ID
      // 固定使用参考接口文档中验证可用的 spaceType（spaceclass 模式，不依赖具体 spaceId）
      const spaceType = ticketData.spaceType || 'SFT-01.09.04'
      console.log('Using fixed report issue type:', FIXED_REPORT_ISSUE_TYPE_NAME, reportIssueType)

      const payload = {
        projectId: ticketData.projectId || 'Pj9909990007',
        reportIssueType,
        reportObj: {
          buildingId: ticketData.buildingId || 'Bd61011220109396782598344e14b546aaa58430fddd',
          floorId: ticketData.floorId || 'Fl61011220101bc101e0978941c68884a1eacaccf322',
          objId: spaceType,
          objName: ticketData.objName || ticketData.spaceName || '储藏室',
          objType: 'spaceclass',
          positionName: ticketData.positionName || '2#楼/B3/储藏室',
          spaceId: null,
          spaceType
        },
        description: ticketData.description || '',
        photos: uploadedPhotos,
        videos: [],
        appointmentTime: ticketData.appointmentTime || '',
        contacts: ticketData.reporterName || userPhone.value || '',
        phone: ticketData.phone || userPhone.value || '',
        orderFromType: 'manual',
        creatorId: userPhone.value || '',
        creatorName: ticketData.reporterName || userPhone.value || '',
        spaceType,
        createChannel: 'YHBS-ZXBS'
      }

      const res = await fetch('/fm-workorder-server/work/order/report/add', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify(payload)
      })
      const responseData = await res.json()

      if (responseData.code === '00000') {
        const orderId = responseData.data?.orderId || responseData.data?.id || ''
        const orderNo = responseData.data?.orderNo || responseData.data?.orderNum || orderId
        const successCardData = buildSubmitSuccessCardData(cardData, ticketData, uploadedPhotos)

        // 提交成功后移除工单卡片
        clearPendingReportCards()

        messages.value.push({
          id: Date.now() + 10,
          type: 'system',
          content: `工单提交成功 🎉，工单编号：\n[[${orderNo || '已生成'}|${orderId}]]`,
          isSubmitSuccess: true,
          isSubmitSuccessCard: true,
          cardData: successCardData,
          orderId,
          orderNo,
          timestamp: new Date()
        })
        startNextReportDraft()
        return true
      } else {
        throw new Error(responseData.message || '接口返回错误')
      }
    } catch (err) {
      console.error('Ticket creation failed:', err)
      messages.value.push({
        id: Date.now() + 10,
        type: 'system',
        content: `❌ 工单提交失败：${err.message}`,
        timestamp: new Date()
      })
      return false
    }
  }

  // ===== 获取报事类型 =====
  async function fetchIssueTypes(spaceType, spaceId) {
    try {
      const res = await fetch('/fm-workorder-server/report/issue/type/tree-search', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          name: '',
          problemNatureCodes: ['ASSISTANCE_NEED', 'REPORT_REPAIR'],
          projectId: 'Pj9909990007',
          userId: userPhone.value || '',
          spaceType: spaceType || null,
          spaceId: spaceId || null
        })
      })
      const data = await res.json()
      if (data.code === '00000' && data.data) return data.data
      return []
    } catch (e) {
      console.error('Failed to fetch issue types', e)
      return []
    }
  }

  // ===== 传统报事表单提交 =====
  async function submitTraditionalReport(formData) {
    const payload = {
      projectId: 'Pj9909990007',
      reportIssueType: FIXED_REPORT_ISSUE_TYPE_ID,
      reportObj: {
        buildingId: formData.buildingId || '',
        floorId: formData.floorId || '',
        objId: formData.spaceId || '',
        objName: formData.spaceName || '',
        objType: 'space',
        positionName: formData.positionName || '',
        spaceId: formData.spaceId || '',
        spaceType: formData.spaceType || ''
      },
      description: formData.description || '',
      photos: formData.photos || [],
      videos: [],
      appointmentTime: formData.appointmentTime || '',
      contacts: formData.reporter || '',
      phone: formData.phone || userPhone.value || '',
      orderFromType: 'manual',
      creatorId: userPhone.value || '',
      creatorName: userPhone.value || '',
      spaceType: formData.spaceType || '',
      createChannel: 'YHBS-ZXBS'
    }

    const res = await fetch('/fm-workorder-server/work/order/report/add', {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(payload)
    })
    const responseData = await res.json()
    if (responseData.code === '00000') {
      clearPendingReportCards()
      startNextReportDraft()
      return responseData
    } else {
      throw new Error(responseData.message || '提交失败')
    }
  }

  // ===== 查询用户工单列表 =====
  async function queryUserTickets(filters = {}) {
    try {
      const payload = {
        creatorId: userPhone.value,
        size: filters.size || 20,
        type: filters.status || 'ALL'
      }
      if (filters.keyword) {
        payload.keyword = filters.keyword
      }

      const res = await fetch('/fm-workorder-server/repair/list-page', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.code === '00000' && data.data) return data.data
      return { records: [], total: 0 }
    } catch (e) {
      console.error('Query tickets failed', e)
      return { records: [], total: 0 }
    }
  }

  // ===== 输入模式切换 =====
  function toggleInputMode() {
    inputMode.value = inputMode.value === 'voice' ? 'text' : 'voice'
  }

  function setRecording(status) {
    isRecording.value = status
  }

  return {
    messages,
    isLoading,
    isRecording,
    inputMode,
    isAiMode,
    isLoggedIn,
    userPhone,
    userToken,
    tenantData,
    bfListData,
    reportDraft,
    qrContext,
    currentSkill,
    fixedReportIssueTypeId: FIXED_REPORT_ISSUE_TYPE_ID,
    fixedReportIssueTypeName: FIXED_REPORT_ISSUE_TYPE_NAME,
    getCurrentDraftImageMessages,
    getCurrentDraftPhotos,
    getApiHeaders,
    updateReportDraft,
    setReportDraftImages,
    removeReportDraftImage,
    resetCurrentReportDraft,
    login,
    logout,
    switchSkill,
    addMessage,
    uploadImage,
    executeTicketCreation,
    fetchIssueTypes,
    submitTraditionalReport,
    queryUserTickets,
    toggleInputMode,
    setRecording
  }
})
