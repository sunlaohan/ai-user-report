import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'
import os from 'node:os'
import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import fetch from 'node-fetch'
// 确保正确加载.env文件并覆盖已存在的环境变量
const envPath = path.resolve(__dirname, '.env')
const envFileContent = fs.readFileSync(envPath, 'utf-8')

// 手动解析.env文件并强制设置环境变量
envFileContent.split('\n').forEach(line => {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=')
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim()
      process.env[key.trim()] = value
      console.log(`Set env: ${key.trim()} = ${value.substring(0, 20)}...`)
    }
  }
})

console.log('Final MODEL_ID:', process.env.MODEL_ID)

const rawHostname = os.hostname()
const localNetworkHostname = rawHostname.endsWith('.local') ? rawHostname : `${rawHostname}.local`
const sslCertDir = path.resolve(__dirname, `node_modules/.vite/basic-ssl-${localNetworkHostname.replace(/[^a-z0-9.-]/gi, '_')}`)
const QUERY_TICKET_LIMIT = 8
const QUERY_DETAIL_LIMIT = 2

const REPORT_RUNTIME_PROMPT = `你是AI用户报事助手，目标是用最少追问帮用户完成报事。
规则：
1. 优先复用上下文中的项目、位置、手机号和当前工单草稿，不要让用户重复填写。
2. 维护字段：所属项目、报事位置、报事类型、事项描述、联系电话、报事人、图片。
3. 本次演示中，报事类型固定为“物品损坏报修”，视为系统已确定，不要再询问、匹配或修改其他类型。
4. 必填只有：所属项目、报事位置、事项描述、联系电话。图片是选填，只提醒不拦截。
5. 用户说“改一下位置/电话/类型/描述”时，视为修改当前草稿，增量更新，不要重开一单。
6. 一次只追问一个最关键的缺失字段，不要连续追问多个问题。
7. 报事位置必须尽量完整到“建筑/楼层/空间”，不能从项目名称推断位置，不能编造字段。
8. 所有卡片中的“报事类型”都固定填写为“物品损坏报修”；ticketPayload.issueTypeName 也固定填写为“物品损坏报修”。
9. 始终只保留一张最新卡片。

输出要求：
- 若必填未齐，先用一句自然语言说明，再输出 INFO_CARD。
- 若必填已齐，先用一句自然语言确认，再输出 CONFIRM_CARD。
- 除卡片外不要输出多余解释，不要重复整段字段。

INFO_CARD 格式：
:::INFO_CARD_START:::
\`\`\`json
{"title":"创建用户报事工单：","details":[{"label":"所属项目","value":"项目名称"},{"label":"报事位置","value":"位置信息"},{"label":"报事类型","value":"物品损坏报修"},{"label":"事项描述","value":"描述内容"},{"label":"联系电话","value":"手机号"},{"label":"报事人","value":"姓名或未填写"},{"label":"图片","value":"未上传或已上传"}],"hint":"这里写当前唯一追问或提醒"}
\`\`\`
:::INFO_CARD_END:::

CONFIRM_CARD 格式：
:::CONFIRM_CARD_START:::
\`\`\`json
{"title":"创建用户报事工单：","details":[{"label":"所属项目","value":"项目名称"},{"label":"报事位置","value":"位置信息"},{"label":"报事类型","value":"物品损坏报修"},{"label":"事项描述","value":"描述内容"},{"label":"联系电话","value":"手机号"},{"label":"报事人","value":"姓名或未填写"},{"label":"图片","value":"未上传或已上传"}],"hasPhoto":false,"ticketPayload":{"projectId":"项目ID","projectName":"项目名称","buildingId":"建筑ID","floorId":"楼层ID","spaceId":"空间ID","spaceName":"空间名称","spaceType":"空间类型","positionName":"完整位置名称","objName":"对象名称","issueTypeName":"物品损坏报修","description":"事项描述","phone":"联系电话","reporterName":"报事人"}}
\`\`\`
:::CONFIRM_CARD_END:::`

const QUERY_RUNTIME_PROMPT = `你是AI报事查询助手，只能回答当前登录用户本人的报事工单。
规则：
1. 只能基于提供的真实工单数据回答，不能编造，也不能扩大到他人范围。
2. 优先回答用户最关心的状态、最近节点、处理结果、评价信息。
3. 若命中单条，给简洁摘要；若命中多条，给前几条候选；若是统计问题，直接给统计结论；若无结果，明确说明并提示调整条件。
4. 当提到具体工单时，名称要用 [[工单名称|工单ID]] 形式，便于前端跳转详情。
5. 若用户想看详情或流程，优先基于提供的详情数据回答，不要臆测未提供字段。
6. 保留最近一轮查询语境，但回复保持简洁。

输出风格：
- 单条摘要：先给 [[工单名称|工单ID]]，再给状态、时间、编号、位置、类型、描述、处理结果或流程关键节点。
- 多条候选：按相关度或时间列出 2-5 条，每条包含名称链接、状态、时间、位置、类型。
- 统计：一句先说结论，必要时补充拆分。
- 无结果：说明未找到，并建议用户补充时间、位置、关键词、工单编号。`

// 工单状态映射
const STATUS_MAP = {
  1: '抢单中',
  2: '抢单中',
  3: '指派中',
  4: '待接单',
  5: '执行中',
  6: '方案审核中',
  7: '审批中',
  8: '已完成',
  9: '已关闭',
  10: '已取消',
  11: '已评价'
}

// 获取工单状态标签
function getStatusLabel(statusCode) {
  return STATUS_MAP[statusCode] || `未知状态(${statusCode})`
}

function getRuntimePrompt(skill) {
  return skill === 'query' ? QUERY_RUNTIME_PROMPT : REPORT_RUNTIME_PROMPT
}

function toTimeMs(dateStr) {
  if (!dateStr) return 0
  const time = new Date(dateStr).getTime()
  return Number.isNaN(time) ? 0 : time
}

function formatDateForAI(dateStr) {
  if (!dateStr) return '未知时间'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return String(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function shortText(text, max = 48) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return '无'
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized
}

function normalizeText(text) {
  return String(text || '').toLowerCase()
}

function getTicketTitle(ticket) {
  return ticket.workOrderName || '未命名'
}

function getTicketLocation(ticket) {
  return ticket.reportLocation || '未知位置'
}

function getTicketSearchText(ticket) {
  return [
    getTicketTitle(ticket),
    ticket.orderId,
    ticket.orderNumber,
    ticket.reportType,
    getTicketLocation(ticket),
    ticket.projectName,
    ticket.issueDescription,
    getStatusLabel(ticket.workOrderState)
  ].filter(Boolean).join(' ').toLowerCase()
}

function scoreTicket(ticket, query) {
  const normalizedQuery = normalizeText(query).trim()
  if (!normalizedQuery) return 0

  const title = normalizeText(getTicketTitle(ticket))
  const location = normalizeText(getTicketLocation(ticket))
  const type = normalizeText(ticket.reportType)
  const description = normalizeText(ticket.issueDescription)
  const status = normalizeText(getStatusLabel(ticket.workOrderState))
  const orderNo = normalizeText(ticket.orderNumber || ticket.orderId)
  const searchableText = getTicketSearchText(ticket)

  let score = searchableText.includes(normalizedQuery) ? 20 : 0
  const keywords = normalizedQuery
    .split(/[\s，。！？、,.:"“”'‘’()（）/_-]+/)
    .filter(Boolean)
    .filter(keyword => keyword.length >= 2)
    .slice(0, 8)

  keywords.forEach(keyword => {
    if (title.includes(keyword)) score += 6
    if (location.includes(keyword)) score += 5
    if (type.includes(keyword)) score += 4
    if (description.includes(keyword)) score += 3
    if (status.includes(keyword)) score += 3
    if (orderNo.includes(keyword)) score += 8
  })

  return score
}

function sortTicketsByRelevance(tickets, userQuery = '') {
  return [...tickets].sort((a, b) => {
    const scoreDiff = scoreTicket(b, userQuery) - scoreTicket(a, userQuery)
    if (scoreDiff !== 0) return scoreDiff
    return toTimeMs(b.updateTime || b.creationTime) - toTimeMs(a.updateTime || a.creationTime)
  })
}

function shouldExpandTicketDetail(userQuery = '') {
  const query = normalizeText(userQuery)
  return ['详情', '流程', '进度', '节点', '处理结果', '处理反馈', '评价', '完成了吗', '到哪一步'].some(keyword => query.includes(keyword))
}

// 格式化工单数据为AI可读格式
function formatTicketsForAI(tickets, { userQuery = '', totalCount = tickets.length } = {}) {
  if (!tickets || tickets.length === 0) {
    return '当前用户暂无报事工单记录。'
  }

  const rankedTickets = sortTicketsByRelevance(tickets, userQuery)
  const selectedTickets = rankedTickets.slice(0, QUERY_TICKET_LIMIT)
  const formattedList = selectedTickets.map((ticket, index) => {
    return `${index + 1}. 名称链接：[[${getTicketTitle(ticket)}|${ticket.orderId}]]
状态：${getStatusLabel(ticket.workOrderState)}
工单编号：${ticket.orderNumber || ticket.orderId || '无'}
报事类型：${ticket.reportType || '未分类'}
报事位置：${getTicketLocation(ticket)}
创建时间：${formatDateForAI(ticket.creationTime)}
处理时间：${ticket.handlerTime ? formatDateForAI(ticket.handlerTime) : '无'}
事项描述：${shortText(ticket.issueDescription, 60)}
处理反馈：${shortText(ticket.executionResult, 60)}`
  }).join('\n\n')

  const omittedCount = Math.max(totalCount - selectedTickets.length, 0)
  return `当前用户共有 ${totalCount} 条报事工单，以下是最相关或最新的 ${selectedTickets.length} 条${omittedCount ? `（已省略 ${omittedCount} 条）` : ''}：

${formattedList}`
}

// 获取工单详情
async function fetchTicketDetail(orderId, token) {
  try {
    const response = await fetch(`https://qa-gw.meos.net.cn/fm-workorder-server/repair/detail?orderId=${orderId}`, {
      method: 'GET',
      headers: {
        'Token': token,
        'Group-Code': 'TYXN',
        'groupcode': 'TYXN',
        'Project-Id': 'Pj9909990007',
        'Content-Type': 'application/json'
      }
    })
    const data = await response.json()
    if (data.code === '00000' && data.data) {
      return data.data
    }
    return null
  } catch (error) {
    console.error('Failed to fetch ticket detail:', error)
    return null
  }
}

// 获取工单流程记录
async function fetchProcessRecord(orderId, token) {
  try {
    const response = await fetch(`https://qa-gw.meos.net.cn/fm-workorder-server/repair/process-record?orderId=${orderId}`, {
      method: 'POST',
      headers: {
        'Token': token,
        'Group-Code': 'TYXN',
        'groupcode': 'TYXN',
        'Project-Id': 'Pj9909990007',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ orderId })
    })
    const data = await response.json()
    if (data.code === '00000' && data.data) {
      return data.data
    }
    return []
  } catch (error) {
    console.error('Failed to fetch process record:', error)
    return []
  }
}

// 格式化工单详情为AI可读格式
function formatTicketDetailForAI(ticket, processRecords) {
  if (!ticket) {
    return '未找到该工单详情。'
  }

  const detailLines = [
    '【工单详情】',
    `名称链接：[[${getTicketTitle(ticket)}|${ticket.orderId}]]`,
    `当前状态：${getStatusLabel(ticket.workOrderState)}`,
    `工单编号：${ticket.orderNumber || ticket.orderId || '无'}`,
    `报事类型：${ticket.reportType || '未分类'}`,
    `报事位置：${getTicketLocation(ticket)}`,
    `项目名称：${ticket.projectName || '未知项目'}`,
    `事项描述：${shortText(ticket.issueDescription, 120)}`,
    `创建时间：${formatDateForAI(ticket.creationTime)}`,
    `更新时间：${formatDateForAI(ticket.updateTime)}`,
    `处理反馈：${shortText(ticket.executionResult, 120)}`
  ]

  if (ticket.evaluates && ticket.evaluates.length > 0) {
    const latestEvaluate = ticket.evaluates[0]
    detailLines.push(`评价：${latestEvaluate.score || '未评分'}分，${shortText(latestEvaluate.evaluate, 60)}`)
  }

  if (processRecords && processRecords.length > 0) {
    const processInfo = processRecords
      .slice(0, 6)
      .map(p => {
        const time = p.dateTime ? formatDateForAI(p.dateTime) : (p.isProcessed ? '已完成' : '未到达')
        const marker = p.isCurrentNode ? '当前节点' : (p.isProcessed ? '已到达' : '未到达')
        return `${marker}:${p.record}-${time}`
      })
      .join('；')
    detailLines.push(`流程：${processInfo}`)
  }

  return detailLines.join('\n')
}

const aiProxyPlugin = () => ({
  name: 'ai-proxy',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      // 添加测试端点用于检查环境变量
      if (req.url === '/api/test-env') {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({
          MODEL_ID: process.env.MODEL_ID || 'NOT_SET',
          API_KEY: process.env.API_KEY ? 'SET (length: ' + process.env.API_KEY.length + ')' : 'NOT_SET',
          ARK_API_KEY: process.env.ARK_API_KEY ? 'SET (length: ' + process.env.ARK_API_KEY.length + ')' : 'NOT_SET'
        }))
        return
      }

      if (req.url === '/api/ai-chat' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            const messages = data.messages || [];
            const skill = data.skill || 'report';
            const userPhone = data.userPhone || '';
            const userToken = data.userToken || '';
            
            console.log('=== AI Chat Request ===')
            console.log('skill:', skill)
            console.log('userPhone:', userPhone ? `${userPhone.substring(0, 3)}****` : 'EMPTY')
            console.log('userToken:', userToken ? `${userToken.substring(0, 10)}...` : 'EMPTY')
            console.log('Will fetch tickets:', skill === 'query' && userToken && userPhone)

            const lastUserMessage = [...messages].reverse().find(message => message.role === 'user' && message.content)
            const lastUserQuery = lastUserMessage?.content || ''
            let systemPrompt = getRuntimePrompt(skill)

            // 如果是查询模式，注入工单数据
            if (skill === 'query' && userToken && userPhone) {
              console.log('[Query Mode] Fetching tickets for user:', userPhone)
              try {
                // 获取用户工单列表
                console.log('[Query Mode] Calling API: /fm-workorder-server/repair/list-page')
                const listResponse = await fetch('https://qa-gw.meos.net.cn/fm-workorder-server/repair/list-page', {
                  method: 'POST',
                  headers: {
                    'Token': userToken,
                    'Group-Code': 'TYXN',
                    'groupcode': 'TYXN',
                    'Project-Id': 'Pj9909990007',
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    creatorId: userPhone,
                    size: 50, // 获取最近50条
                    type: 'ALL'
                  })
                })

                console.log('[Query Mode] API Response status:', listResponse.status)
                const listData = await listResponse.json()
                
                // API 返回的是 data: [...] 数组，不是 data.records
                const tickets = Array.isArray(listData.data) ? listData.data : (listData.data?.records || [])
                console.log('[Query Mode] Tickets count:', tickets.length)
                console.log('[Query Mode] First ticket (if any):', tickets[0]?.workOrderName)

                let ticketsContext = ''
                if (listData.code === '00000' && tickets.length > 0) {
                  const rankedTickets = sortTicketsByRelevance(tickets, lastUserQuery)
                  const relevantTickets = rankedTickets.slice(0, QUERY_TICKET_LIMIT)
                  console.log('[Query Mode] Selected ticket IDs:', relevantTickets.map(t => t.orderId).join(', '))

                  ticketsContext = formatTicketsForAI(relevantTickets, {
                    userQuery: lastUserQuery,
                    totalCount: tickets.length
                  })

                  if (shouldExpandTicketDetail(lastUserQuery)) {
                    const detailTargets = rankedTickets.slice(0, QUERY_DETAIL_LIMIT)
                    for (const ticket of detailTargets) {
                      const detail = await fetchTicketDetail(ticket.orderId, userToken)
                      const processRecords = await fetchProcessRecord(ticket.orderId, userToken)
                      if (detail) {
                        ticketsContext += `\n\n${formatTicketDetailForAI(detail, processRecords)}`
                      }
                    }
                  }
                } else {
                  ticketsContext = '当前用户暂无报事工单记录。'
                }

                // 将工单数据追加到系统提示词
                systemPrompt += `\n\n## 当前用户工单数据\n以下是当前登录用户（手机号：${userPhone}）最相关的真实工单数据，请只基于这些数据回答：\n\n${ticketsContext}\n\n回答约束：不得编造工单信息；名称和工单ID必须准确对应；状态请用中文标签回复。`
              } catch (error) {
                console.error('Failed to fetch user tickets:', error)
                systemPrompt += `\n\n## 当前用户工单数据\n\n获取用户工单数据失败，请提示用户稍后重试。`
              }
            } else if (skill === 'query') {
              // 查询模式但缺少用户信息
              console.log('[Query Mode] Missing user info - userPhone:', !!userPhone, 'userToken:', !!userToken)
              systemPrompt += `\n\n## 当前用户工单数据\n\n当前用户未登录或登录信息缺失，无法查询工单数据。请提示用户先登录后再使用查询功能。`
            }

            const payload = {
              model: process.env.MODEL_ID,
              messages: [
                { role: 'system', content: systemPrompt },
                ...messages
              ],
              stream: false
            };

            const messageChars = messages.reduce((sum, message) => sum + String(message.content || '').length, 0)
            console.log('[AI Payload] systemPrompt chars:', systemPrompt.length)
            console.log('[AI Payload] message chars:', messageChars)
            console.log('[AI Payload] total messages:', payload.messages.length)

            const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.API_KEY}`
              },
              body: JSON.stringify(payload)
            });

            if (!response.ok) {
              const errText = await response.text();
              console.error('AI API Error:', response.status, errText);
              res.statusCode = response.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'AI API request failed', detail: errText }));
              return;
            }

            const result = await response.json();

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (error) {
            console.error('Proxy error:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
          }
        });
        return;
      }
      next();
    });
  }
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), basicSsl({
    name: localNetworkHostname,
    domains: [localNetworkHostname],
    certDir: sslCertDir
  }), aiProxyPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: true,
    proxy: {
      '/mid-permission-server': {
        target: 'https://qa.meos.center',
        changeOrigin: true,
        headers: {
          'Referer': 'https://qa.meos.center/tenantrepair/login?groupCode=TYXN&isTenant=false&isRepair=true',
          'Origin': 'https://qa.meos.center'
        }
      },
      '/fm-workorder-server': {
        target: 'https://qa-gw.meos.net.cn',
        changeOrigin: true,
        headers: {
          'Referer': 'https://qa.meos.center/',
          'Origin': 'https://qa.meos.center'
        }
      },
      '/dtp-rwd-server': {
        target: 'https://qa.ysbdtp.com',
        changeOrigin: true,
        headers: {
          'Referer': 'https://qa.meos.center/',
          'Origin': 'https://qa.meos.center'
        }
      },
      '/mid-frame-server': {
        target: 'https://qa.meos.center',
        changeOrigin: true,
        headers: {
          'Referer': 'https://qa.meos.center/',
          'Origin': 'https://qa.meos.center'
        }
      },
      '/dtp-file-server': {
        target: 'https://qa.ysbdtp.com',
        changeOrigin: true,
        headers: {
          'Referer': 'https://qa.meos.center/',
          'Origin': 'https://qa.meos.center'
        }
      }
    }
  }
})
