// Netlify Function: test-env
// 用于验证 Netlify 上环境变量是否正确配置
export async function handler(event, context) {
  const payload = {
    MODEL_ID: process.env.MODEL_ID || 'NOT_SET',
    API_KEY: process.env.API_KEY ? `SET (length: ${process.env.API_KEY.length})` : 'NOT_SET',
    ARK_API_KEY: process.env.ARK_API_KEY ? `SET (length: ${process.env.ARK_API_KEY.length})` : 'NOT_SET',
    NODE_VERSION: process.version
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(payload)
  }
}
