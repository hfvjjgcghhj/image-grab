/**
 * main.js —— 图提取官网交互脚本
 * 功能：
 *   1. 移动端汉堡菜单展开/收起
 *   2. 导航栏滚动吸顶阴影（.scrolled）
 *   3. 当前区块导航高亮（滚动监听 Scroll Spy）
 *   4. 元素进入视口淡入上移动画（IntersectionObserver）
 *   5. 锚点平滑滚动 + 点击导航后自动收起菜单
 */

(() => {
  'use strict';

  /* ---------------- 1. 汉堡菜单 ---------------- */
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('nav-links');

  function toggleMenu(force) {
    const isOpen = force !== undefined ? force : !navLinks.classList.contains('open');
    navLinks.classList.toggle('open', isOpen);
    hamburger.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', String(isOpen));
  }

  hamburger.addEventListener('click', () => toggleMenu());

  // 点击导航链接后收起菜单（移动端）
  navLinks.addEventListener('click', (e) => {
    if (e.target.closest('a')) toggleMenu(false);
  });

  /* ---------------- 2. 导航栏滚动阴影 ---------------- */
  const navbar = document.getElementById('navbar');
  function onScrollNavbar() {
    navbar.classList.toggle('scrolled', window.scrollY > 10);
  }
  window.addEventListener('scroll', onScrollNavbar, { passive: true });
  onScrollNavbar();

  /* ---------------- 3. Scroll Spy：当前区块高亮 ---------------- */
  // 收集所有带 id 的 section 与对应导航链接
  const sections = document.querySelectorAll('main section[id]');
  const links = Array.from(document.querySelectorAll('.nav-link'));

  function onScrollSpy() {
    let currentId = '';
    const scrollPos = window.scrollY + 100; // 偏移量，提前高亮

    sections.forEach((section) => {
      if (scrollPos >= section.offsetTop) {
        currentId = section.id;
      }
    });

    links.forEach((link) => {
      const href = link.getAttribute('href');
      const targetId = href ? href.slice(1) : '';
      link.classList.toggle('active', targetId === currentId);
    });
  }
  window.addEventListener('scroll', onScrollSpy, { passive: true });
  onScrollSpy();

  /* ---------------- 4. 进入视口淡入动画 ---------------- */
  const revealEls = document.querySelectorAll('.reveal');

  // 对不支持 IntersectionObserver 的旧浏览器直接显示
  if (!('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('visible'));
  } else {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            obs.unobserve(entry.target); // 动画只触发一次
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    revealEls.forEach((el) => observer.observe(el));
  }

  /* ---------------- 5. 锚点平滑滚动 ---------------- */
  // CSS 已使用 scroll-behavior: smooth，这里额外处理移动端菜单位置偏移
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (!target) return;
      e.preventDefault();
      const navHeight = navbar.offsetHeight;
      const top = target.getBoundingClientRect().top + window.scrollY - navHeight + 1;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
})();
