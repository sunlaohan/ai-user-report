// 通用 API 代理函数
// 将前端的 API 请求通过 Netlify Function 转发到后端服务器
// 解决 Netlify redirect 代理不转发自定义 headers 的问题

const PROXY_ROUTES = {
  '/mid-permission-server': {
    target: 'https://qa.meos.center',
    headers: {
      'Referer': 'https://qa.meos.center/tenantrepair/login?groupCode=TYXN&isTenant=false&isRepair=true',
      'Origin': 'https://qa.meos.center'
    }
  },
  '/fm-workorder-server': {
    target: 'https://qa-gw.meos.net.cn',
    headers: {
      'Referer': 'https://qa.meos.center/',
      'Origin': 'https://qa.meos.center'
    }
  },
  '/dtp-rwd-server': {
    target: 'https://qa.ysbdtp.com',
    headers: {
      'Referer': 'https://qa.meos.center/',
      'Origin': 'https://qa.meos.center'
    }
  },
  '/mid-frame-server': {
    target: 'https://qa.meos.center',
    headers: {
      'Referer': 'https://qa.meos.center/',
      'Origin': 'https://qa.meos.center'
    }
  },
  '/dtp-file-server': {
    target: 'https://qa.ysbdtp.com',
    headers: {
      'Referer': 'https://qa.meos.center/',
      'Origin': 'https://qa.meos.center'
    }
  }
}

// 不需要转发的 headers
const SKIP_HEADERS = new Set([
  'host',
  'connection',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-nf-client-connection-ip',
  'x-nf-request-id',
  'x-nf-account-id',
  'x-nf-site-id',
  'via',
  'cdn-loop'
])

export async function handler(event) {
  // CORS 预检
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS'
      },
      body: ''
    }
  }

  try {
    // 从 path 中提取真实 API 路径
    // URL 格式: /api/api-proxy/<actualPath>
    // event.path 可能是 /.netlify/functions/api-proxy/mid-permission-server/xxx
    // 或通过 redirect: /api/api-proxy/mid-permission-server/xxx
    let apiPath = event.path

    // 移除 function 路由前缀
    const prefixes = [
      '/.netlify/functions/api-proxy',
      '/api/api-proxy'
    ]
    for (const prefix of prefixes) {
      if (apiPath.startsWith(prefix)) {
        apiPath = apiPath.substring(prefix.length)
        break
      }
    }

    // 确保以 / 开头
    if (!apiPath.startsWith('/')) {
      apiPath = '/' + apiPath
    }

    console.log('[api-proxy] Method:', event.httpMethod, 'Path:', apiPath)

    // 匹配路由
    let matchedRoute = null
    let matchedPrefix = null
    for (const [prefix, config] of Object.entries(PROXY_ROUTES)) {
      if (apiPath.startsWith(prefix)) {
        matchedRoute = config
        matchedPrefix = prefix
        break
      }
    }

    if (!matchedRoute) {
      console.error('[api-proxy] No matching route for:', apiPath)
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No matching proxy route', path: apiPath })
      }
    }

    // 构建目标 URL
    const targetUrl = matchedRoute.target + apiPath
    console.log('[api-proxy] Proxying to:', targetUrl)

    // 构建转发的 headers
    const forwardHeaders = { ...matchedRoute.headers }

    // 转发客户端发送的有用 headers
    if (event.headers) {
      for (const [key, value] of Object.entries(event.headers)) {
        const lowerKey = key.toLowerCase()
        if (!SKIP_HEADERS.has(lowerKey) && !lowerKey.startsWith('x-nf-')) {
          forwardHeaders[key] = value
        }
      }
    }

    // 确保覆盖 origin/referer 为目标服务器期望的值
    forwardHeaders['Referer'] = matchedRoute.headers['Referer']
    forwardHeaders['Origin'] = matchedRoute.headers['Origin']

    // 发起请求
    const fetchOptions = {
      method: event.httpMethod,
      headers: forwardHeaders
    }

    // 对于有 body 的请求，转发 body
    if (event.body && ['POST', 'PUT', 'PATCH'].includes(event.httpMethod)) {
      fetchOptions.body = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64')
        : event.body
    }

    const response = await fetch(targetUrl, fetchOptions)

    // 读取响应
    const responseBody = await response.text()

    // 构建响应 headers
    const responseHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': '*'
    }

    // 转发响应的 content-type
    const contentType = response.headers.get('content-type')
    if (contentType) {
      responseHeaders['Content-Type'] = contentType
    }

    // 转发 token header（登录接口可能通过 header 返回 token）
    const tokenHeader = response.headers.get('token')
    if (tokenHeader) {
      responseHeaders['token'] = tokenHeader
    }

    console.log('[api-proxy] Response status:', response.status)

    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: responseBody
    }

  } catch (error) {
    console.error('[api-proxy] Error:', error)
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Proxy request failed', detail: error.message })
    }
  }
}
