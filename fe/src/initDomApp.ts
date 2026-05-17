import './styles.css';
import './runtime';
import { $ } from './core';
import { bindAccountAndBilling } from './account';
import { bindCustomDropdowns } from './customDropdown';
import { bindAll } from './events';
import { bindHeaderEditor, captureHeaderDefaults, setHeaderEditorSaveScheduler } from './headerEditor';
import {
  bindLivingBenefitFormatGuards,
  captureLivingBenefitBaselines,
  repairAllLivingBenefitFormats,
} from './livingBenefitFormat';
import { setLivingBenefitColumnSaveScheduler, syncLivingBenefitColumnUI } from './livingBenefitColumns';
import { bindManualSaveButton } from './manualSave';
import { bindUploadZone } from './pdf';
import { loadState, saveState, scheduleSave } from './persistence';
import { installContentProtection } from './protection';
import { bindStyleEditor, setStyleSaveScheduler } from './styleEditor';
import { cloneLogos, render, renderAgeList, renderAgentList, setRenderSaveScheduler, setTab } from './render';
import { state } from './core';
import { hydrateMuiIcons } from './muiIcons';

let initialized = false;

function scrollToLandingTarget(hash: string, smooth: boolean) {
  if (!hash || hash === '#') return;

  const target = document.querySelector<HTMLElement>(hash);
  if (!target) return;
  target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
}

function bindLandingNavigation() {
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      const hash = link.getAttribute('href') || '';
      const target = hash && hash !== '#' ? document.querySelector(hash) : null;
      if (!target) return;
      event.preventDefault();
      history.pushState(null, '', hash);
      scrollToLandingTarget(hash, true);
    });
  });

  if (window.location.hash) {
    window.requestAnimationFrame(() => scrollToLandingTarget(window.location.hash, false));
  }
}

function bindLandingParallax() {
  const hero = document.querySelector<HTMLElement>('.landing-hero');
  if (!hero) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let updateFrame = 0;

  const updateParallax = () => {
    updateFrame = 0;

    if (reducedMotion.matches) {
      hero.style.removeProperty('--landing-parallax-y');
      return;
    }

    const rect = hero.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;

    const progress = (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
    const clampedProgress = Math.min(1, Math.max(0, progress));
    const offset = (clampedProgress - 0.5) * 72;
    hero.style.setProperty('--landing-parallax-y', `${offset.toFixed(1)}px`);
  };

  const scheduleParallaxUpdate = () => {
    if (updateFrame) return;
    updateFrame = window.requestAnimationFrame(updateParallax);
  };

  window.addEventListener('scroll', scheduleParallaxUpdate, { passive: true });
  window.addEventListener('resize', scheduleParallaxUpdate);
  reducedMotion.addEventListener('change', scheduleParallaxUpdate);
  scheduleParallaxUpdate();
}

function isVisibleSection(section: HTMLElement) {
  return !section.hidden && window.getComputedStyle(section).display !== 'none';
}

function bindSectionExperience() {
  const sections = Array.from(document.querySelectorAll<HTMLElement>('.screen-section'));
  if (!sections.length) return;

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && isVisibleSection(entry.target as HTMLElement)) {
          entry.target.classList.add('is-visible');
        }
      });
    }, {
      rootMargin: '0px 0px -16% 0px',
      threshold: 0.18,
    });

    sections.forEach(section => revealObserver.observe(section));
  } else {
    sections.forEach(section => section.classList.add('is-visible'));
  }
}

export function initDomApp() {
  if (initialized) return;
  initialized = true;

  setRenderSaveScheduler(scheduleSave);
  setStyleSaveScheduler(scheduleSave);
  setLivingBenefitColumnSaveScheduler(scheduleSave);
  setHeaderEditorSaveScheduler(scheduleSave);

  // Order matters: restore saved state before the first render, then bind
  // behavior to the React-mounted DOM tree.
  captureLivingBenefitBaselines();
  captureHeaderDefaults();
  loadState();
  bindCustomDropdowns();
  syncLivingBenefitColumnUI();
  repairAllLivingBenefitFormats();
  renderAgeList();
  renderAgentList();
  bindAll();
  bindLandingNavigation();
  bindLandingParallax();
  bindSectionExperience();
  bindAccountAndBilling();
  bindStyleEditor();
  hydrateMuiIcons();

  document.querySelectorAll<HTMLElement>('.lb-toggle-btn').forEach(btn => {
    const target = btn.dataset.target;
    if (!target) return;
    const card = $(target);
    if (!card) return;
    const hidden = card.classList.contains('lb-hidden');
    btn.textContent = hidden ? 'Ẩn ✓' : 'Hiện';
    btn.classList.toggle('is-hidden', hidden);
  });

  bindUploadZone();
  cloneLogos();
  bindHeaderEditor();
  setTab(state.currentTab);
  render();
  syncLivingBenefitColumnUI();
  installContentProtection();

  ['cardOut', 'cardOutTerm'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', scheduleSave);
    el.addEventListener('blur', scheduleSave, true);
  });

  window.addEventListener('beforeunload', () => saveState());
  bindLivingBenefitFormatGuards(scheduleSave);
  bindManualSaveButton();
}
