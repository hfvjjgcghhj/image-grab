/**
 * content.js
 * 职责：
 *   1. 在商品详情页右下角注入悬浮按钮「获取图片」
 *   2. 点击后扫描页面所有商品相关图片（含懒加载、背景图等）
 *   3. 过滤、补全、去重后通过 chrome.runtime.sendMessage 发送给后台
 */

(() => {
  'use strict';

  // 避免重复注入：如果页面里已经有我们的按钮，就直接返回
  if (window.__imageGrabInjected) return;
  window.__imageGrabInjected = true;

  // 最小尺寸阈值（像素）：小于该尺寸的图片（图标、logo、占位图、1x1）会被过滤掉
  const MIN_SIZE = 100;

  /**
   * 判断当前页面是否为「商品详情页」
   * 三大平台详情页 URL 各有特征，这里做兼容判断；识别不出时也允许提取（宽松处理）
   */
  function isProductDetailPage() {
    const url = location.href;
    // 淘宝/天猫：item.htm / detail.tmall.com 等
    if (/item\.htm|detail\.tmall/i.test(url) && /(taobao|tmall)\.com/i.test(url)) return true;
    // 京东：item.jd.com
    if (/item\.jd\.com|\.jd\.com\/\d+\.html/i.test(url)) return true;
    // 拼多多商家版：goods 相关路径
    if (/goods|pinduoduo|yangkeduo/i.test(url)) return true;
    // 其余情况默认允许，方便手动使用
    return true;
  }

  // 仅在详情页注入按钮
  if (!isProductDetailPage()) return;

  /* ---------------- 注入悬浮按钮 ---------------- */
  function createButton() {
    const btn = document.createElement('button');
    btn.id = 'image-grab-btn';
    btn.type = 'button';
    btn.textContent = '获取图片';
    btn.title = '提取本页所有商品图片';
    // 点击事件绑定在按钮上
    btn.addEventListener('click', handleExtract);
    document.documentElement.appendChild(btn);
  }

  /* ---------------- 图片提取主逻辑 ---------------- */

  /** 将相对路径补全为绝对 URL，并清理常见懒加载占位（base64 空图 / data: 太小则后续过滤） */
  function toAbsoluteUrl(src) {
    if (!src) return '';
    // 去掉首尾空白
    let s = String(src).trim();
    // 去掉协议相对写法 //cdn.xxx.com/a.jpg -> https://cdn.xxx.com/a.jpg
    if (s.startsWith('//')) s = location.protocol + s;
    try {
      // new URL 可处理相对路径，自动补全
      return new URL(s, location.href).href;
    } catch (e) {
      return '';
    }
  }

  /** 从 img 元素上收集所有可能的图片地址 */
  function collectFromImg(img) {
    const urls = [];
    // 常规 src
    if (img.src) urls.push(img.src);
    // srcset：取其中最大的一张（取最后一个候选，通常分辨率最高）
    if (img.srcset) {
      const candidates = img.srcset.split(',').map((c) => c.trim().split(/\s+/)[0]);
      if (candidates.length) urls.push(candidates[candidates.length - 1]);
    }
    // 懒加载常用属性
    ['data-src', 'data-lazy-src', 'data-original', 'data-lazyload', 'data-ks-lazyload', 'data-lazy'].forEach((attr) => {
      if (img.getAttribute(attr)) urls.push(img.getAttribute(attr));
    });
    return urls;
  }

  /** 收集所有背景图 */
  function collectBackgroundImages() {
    const urls = [];
    document.querySelectorAll('*').forEach((el) => {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') {
        // 匹配 url(...) 里的地址，可能有多张
        const re = /url\(['"]?([^'")]+)['"]?\)/g;
        let m;
        while ((m = re.exec(bg)) !== null) {
          urls.push(m[1]);
        }
      }
    });
    return urls;
  }

  /** 主提取函数：扫描 -> 过滤 -> 去重 -> 返回图片对象数组 */
  function extractImages() {
    const candidates = [];

    // 1. 所有 <img> 标签
    document.querySelectorAll('img').forEach((img) => {
      const rawUrls = collectFromImg(img);
      const naturalW = img.naturalWidth;
      const naturalH = img.naturalHeight;
      // 已加载的图片直接拿到真实尺寸
      rawUrls.forEach((u) => {
        candidates.push({ url: u, w: naturalW || 0, h: naturalH || 0 });
      });
    });

    // 2. 背景图（无法拿到真实尺寸，默认给 0，后续用 Image 加载确认）
    collectBackgroundImages().forEach((u) => {
      candidates.push({ url: u, w: 0, h: 0 });
    });

    // 3. 统一补全为绝对 URL
    const normalized = candidates
      .map((c) => ({ ...c, url: toAbsoluteUrl(c.url) }))
      .filter((c) => c.url && c.url.startsWith('http'));

    // 4. 去重（按 URL）
    const seen = new Set();
    const deduped = [];
    normalized.forEach((c) => {
      if (seen.has(c.url)) return;
      seen.add(c.url);
      deduped.push(c);
    });

    // 5. 过滤：排除明显是图标/logo/占位图/太小的图片
    //    尺寸未知的（背景图）先保留，后面后台再判断
    const filtered = deduped.filter((c) => {
      const lower = c.url.toLowerCase();
      // 明显占位/空图
      if (/data:image\/gif;base64|1x1|placeholder|blank|loading|spacer|sprite|transparent\.gif|\.svg$/i.test(lower)) return false;
      // 已知尺寸但太小
      if (c.w && c.h && (c.w < MIN_SIZE || c.h < MIN_SIZE)) return false;
      // 已知只有 1x1
      if (c.w === 1 && c.h === 1) return false;
      return true;
    });

    return filtered;
  }

  /** 点击按钮：提取并发送给后台 */
  function handleExtract() {
    const btn = document.getElementById('image-grab-btn');
    // 提取中状态反馈
    if (btn) {
      btn.textContent = '提取中…';
      btn.disabled = true;
    }

    try {
      const images = extractImages();
      if (!images.length) {
        showToast('未找到可提取的图片');
        resetBtn();
        return;
      }
      // 发送给后台：后台负责保存并打开 gallery 页面
      chrome.runtime.sendMessage({ type: 'IMAGES_EXTRACTED', images, pageUrl: location.href }, (resp) => {
        if (chrome.runtime.lastError) {
          showToast('发送失败，请重试');
        }
        resetBtn();
      });
    } catch (e) {
      showToast('提取出错：' + e.message);
      resetBtn();
    }
  }

  function resetBtn() {
    const btn = document.getElementById('image-grab-btn');
    if (btn) {
      btn.textContent = '获取图片';
      btn.disabled = false;
    }
  }

  /** 简单提示条 */
  function showToast(msg) {
    const old = document.getElementById('image-grab-toast');
    if (old) old.remove();
    const div = document.createElement('div');
    div.id = 'image-grab-toast';
    div.textContent = msg;
    document.documentElement.appendChild(div);
    setTimeout(() => div.remove(), 2500);
  }

  // 页面加载完成后注入按钮（等 DOM 稳定）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createButton);
  } else {
    createButton();
  }
})();
