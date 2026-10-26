/**
 * gallery.js
 * 职责：
 *   1. 从 chrome.storage.local 读取提取到的图片列表
 *   2. 网格化展示缩略图 + 尺寸信息 + 复选框
 *   3. 支持全选 / 反选 / 已选数量统计 / 下载选中
 */

(() => {
  'use strict';

  const STORAGE_KEY = 'imageGrabImages';

  const galleryEl = document.getElementById('gallery');
  const emptyEl = document.getElementById('empty');
  const toastEl = document.getElementById('toast');
  const selectedCountEl = document.getElementById('selected-count');
  const btnDownload = document.getElementById('btn-download');
  const btnSelectAll = document.getElementById('btn-select-all');
  const btnInvert = document.getElementById('btn-invert');

  let images = [];       // 所有图片 { url, w, h }
  let selected = new Set(); // 选中的图片 URL 集合

  /* ---------------- 数据加载 ---------------- */
  async function loadImages() {
    const data = await chrome.storage.local.get([STORAGE_KEY]);
    images = data[STORAGE_KEY] || [];
    render();
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    galleryEl.innerHTML = '';
    if (!images.length) {
      emptyEl.hidden = false;
      galleryEl.hidden = true;
      return;
    }
    emptyEl.hidden = true;
    galleryEl.hidden = false;

    images.forEach((img, idx) => {
      const card = document.createElement('div');
      card.className = 'card' + (selected.has(img.url) ? ' selected' : '');
      card.dataset.index = idx;

      // 缩略图
      const thumb = document.createElement('img');
      thumb.className = 'thumb';
      thumb.src = img.url;
      thumb.loading = 'lazy';
      thumb.alt = '商品图 ' + (idx + 1);
      thumb.referrerPolicy = 'no-referrer'; // 尽量规避防盗链
      thumb.addEventListener('error', () => { thumb.src = placeholderSvg(); });

      // 复选框图标
      const check = document.createElement('div');
      check.className = 'check';
      check.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      // 尺寸信息
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `<span>${img.w && img.h ? img.w + '×' + img.h : '未知尺寸'}</span>`;

      card.appendChild(thumb);
      card.appendChild(check);
      card.appendChild(meta);

      // 点击卡片切换选中状态
      card.addEventListener('click', () => toggleSelect(img.url, card));

      galleryEl.appendChild(card);
    });

    updateSummary();
  }

  /** 图片加载失败的占位图（内联 SVG） */
  function placeholderSvg() {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#eef0f5"/><text x="50%" y="50%" fill="#9aa2b1" font-size="14" text-anchor="middle" dominant-baseline="middle">加载失败</text></svg>'
    );
  }

  /* ---------------- 选择逻辑 ---------------- */
  function toggleSelect(url, cardEl) {
    if (selected.has(url)) {
      selected.delete(url);
      cardEl.classList.remove('selected');
    } else {
      selected.add(url);
      cardEl.classList.add('selected');
    }
    updateSummary();
  }

  function selectAll() {
    images.forEach((img) => selected.add(img.url));
    // 同步视觉状态
    document.querySelectorAll('.card').forEach((card) => {
      const idx = Number(card.dataset.index);
      if (selected.has(images[idx].url)) card.classList.add('selected');
    });
    updateSummary();
  }

  function invertSelect() {
    images.forEach((img) => {
      if (selected.has(img.url)) selected.delete(img.url);
      else selected.add(img.url);
    });
    document.querySelectorAll('.card').forEach((card) => {
      const idx = Number(card.dataset.index);
      card.classList.toggle('selected', selected.has(images[idx].url));
    });
    updateSummary();
  }

  function updateSummary() {
    selectedCountEl.textContent = selected.size;
    btnDownload.disabled = selected.size === 0;
  }

  /* ---------------- 下载 ---------------- */
  async function downloadSelected() {
    if (!selected.size) return;
    const toDownload = images.filter((img) => selected.has(img.url));

    btnDownload.disabled = true;
    btnDownload.textContent = '下载中…';
    showToast(`开始下载 ${toDownload.length} 张图片…`);

    try {
      const resp = await chrome.runtime.sendMessage({ type: 'DOWNLOAD_IMAGES', images: toDownload });
      if (resp && resp.ok) {
        const msg = `下载完成：成功 ${resp.success} 张，失败 ${resp.errors.length} 张`;
        showToast(msg);
      } else {
        showToast('下载失败：' + ((resp && resp.error) || '未知错误'));
      }
    } catch (e) {
      showToast('下载出错：' + e.message);
    } finally {
      btnDownload.disabled = selected.size === 0;
      btnDownload.textContent = '下载选中';
    }
  }

  /* ---------------- 提示条 ---------------- */
  let toastTimer;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3000);
  }

  /* ---------------- 事件绑定 ---------------- */
  btnSelectAll.addEventListener('click', selectAll);
  btnInvert.addEventListener('click', invertSelect);
  btnDownload.addEventListener('click', downloadSelected);

  // 后台通知刷新（重新提取后）
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'REFRESH') loadImages();
  });

  // 初始加载
  loadImages();
})();
