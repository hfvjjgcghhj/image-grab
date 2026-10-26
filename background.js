/**
 * background.js
 * 职责（Service Worker）：
 *   1. 接收 content script 提取到的图片列表，存入 storage，并打开 gallery 页面
 *   2. 接收 gallery 的下载请求，将图片统一转为 PNG 后调用 chrome.downloads 下载
 */

// 存储键名
const STORAGE_KEY = 'imageGrabImages';

/* ---------------- 监听消息 ---------------- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'IMAGES_EXTRACTED') {
    // content script 提取完成：保存并打开画廊页
    handleExtracted(msg.images, msg.pageUrl)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true; // 异步响应
  }

  if (msg.type === 'DOWNLOAD_IMAGES') {
    // gallery 页面请求下载选中的图片
    handleDownload(msg.images)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true; // 异步响应
  }
});

/* ---------------- 提取后处理 ---------------- */
async function handleExtracted(images, pageUrl) {
  // 存到本地 storage，供 gallery 页面读取
  await chrome.storage.local.set({ [STORAGE_KEY]: images, pageUrl, timestamp: Date.now() });
  // 打开 gallery 页面
  const url = chrome.runtime.getURL('gallery.html');
  // 如果已有 gallery 标签页则聚焦，否则新建
  const tabs = await chrome.tabs.query({ url });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    // 通知已打开的画廊页刷新数据
    await chrome.tabs.sendMessage(tabs[0].id, { type: 'REFRESH' }).catch(() => {});
  } else {
    await chrome.tabs.create({ url });
  }
}

/* ---------------- 图片转 PNG + 下载 ---------------- */

/**
 * 通过 fetch 拉取图片二进制，转为 PNG 的 dataURL
 * 在 Service Worker 中使用 OffscreenCanvas 处理，可规避页面跨域限制
 */
async function convertToPngDataUrl(imageUrl) {
  // 拉取图片（host_permissions 已覆盖三大平台域名）
  const resp = await fetch(imageUrl, { credentials: 'include' });
  if (!resp.ok) throw new Error('图片拉取失败：' + resp.status);
  const blob = await resp.blob();

  // 解码为位图
  const bitmap = await createImageBitmap(blob);

  // 离屏画布绘制，并导出为 PNG
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);

  const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
  bitmap.close();

  // 转为 dataURL 供 chrome.downloads 使用（也可用 URL.createObjectURL，但 MV3 SW 中推荐 dataURL）
  const arrayBuffer = await pngBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:image/png;base64,' + btoa(binary);
}

/**
 * 处理下载：逐张转换并下载，文件名「商品图_序号.png」，序号补零
 */
async function handleDownload(images) {
  let success = 0;
  const errors = [];

  for (let i = 0; i < images.length; i++) {
    const item = images[i];
    const seq = String(i + 1).padStart(3, '0'); // 001、002...
    const filename = `商品图_${seq}.png`;
    try {
      // 若本身已是 PNG dataURL 可直接用，否则转换
      let dataUrl = item.url;
      if (!item.url.startsWith('data:image/png')) {
        dataUrl = await convertToPngDataUrl(item.url);
      }
      // 触发浏览器下载
      await chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: false,
      });
      success++;
    } catch (e) {
      errors.push({ url: item.url, error: e.message });
    }
  }

  return { success, total: images.length, errors };
}
