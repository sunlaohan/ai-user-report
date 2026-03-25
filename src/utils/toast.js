export function showToast(message, duration = 2000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 16px;
    z-index: 9999;
    max-width: 80%;
    text-align: center;
  `

  document.body.appendChild(toast)

  setTimeout(() => {
    toast.remove()
  }, duration)
}
