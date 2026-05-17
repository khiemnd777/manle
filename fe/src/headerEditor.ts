import { $ } from './core';
import { authorizeFeatureUse, canUseEntitlement, entitlementsLoaded } from './account';

type ProductTab = 'iul' | 'term';

type HeaderState = {
  title?: string;
  logo?: string;
};

const CONFIG: Record<ProductTab, {
  cardId: string;
  titleInputId: string;
  logoInputId: string;
  logoPreviewInputId: string;
  logoPreviewId: string;
}> = {
  iul: {
    cardId: 'cardOut',
    titleInputId: 'iulHeaderTitleInput',
    logoInputId: 'iulHeaderLogoInput',
    logoPreviewInputId: 'iulHeaderLogoPreviewInput',
    logoPreviewId: 'iulHeaderLogoEditorPreview',
  },
  term: {
    cardId: 'cardOutTerm',
    titleInputId: 'termHeaderTitleInput',
    logoInputId: 'termHeaderLogoInput',
    logoPreviewInputId: 'termHeaderLogoPreviewInput',
    logoPreviewId: 'termHeaderLogoEditorPreview',
  },
};

let scheduleSaveCallback = () => {};
const defaultHeaderState: Partial<Record<ProductTab, HeaderState>> = {};

export function setHeaderEditorSaveScheduler(fn: () => void) {
  scheduleSaveCallback = fn;
}

function escapeHTML(value: string) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cardFor(product: ProductTab) {
  return $(CONFIG[product].cardId) as HTMLElement | null;
}

function titleFor(product: ProductTab) {
  return cardFor(product)?.querySelector('.card-title') as HTMLElement | null;
}

function logoFor(product: ProductTab) {
  return cardFor(product)?.querySelector('.ta-pill img') as HTMLImageElement | null;
}

function logoPillFor(product: ProductTab) {
  return cardFor(product)?.querySelector('.ta-pill') as HTMLElement | null;
}

function titleInputFor(product: ProductTab) {
  return $(CONFIG[product].titleInputId) as HTMLTextAreaElement | null;
}

function logoInputFor(product: ProductTab) {
  return $(CONFIG[product].logoInputId) as HTMLInputElement | null;
}

function logoPreviewInputFor(product: ProductTab) {
  return $(CONFIG[product].logoPreviewInputId) as HTMLInputElement | null;
}

function logoPreviewFor(product: ProductTab) {
  return $(CONFIG[product].logoPreviewId) as HTMLImageElement | null;
}

function textFromTitle(title: HTMLElement) {
  return (title.innerText || title.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function htmlFromTitleText(value: string) {
  return String(value || '')
    .split(/\r?\n/)
    .map(line => escapeHTML(line))
    .join('<br>');
}

function canEditHeader() {
  return canUseEntitlement('branding');
}

function captureProductHeader(product: ProductTab): HeaderState {
  return {
    title: titleFor(product)?.innerHTML || '',
    logo: logoFor(product)?.getAttribute('src') || logoFor(product)?.src || '',
  };
}

export function captureHeaderDefaults() {
  (['iul', 'term'] as ProductTab[]).forEach(product => {
    defaultHeaderState[product] = captureProductHeader(product);
  });
}

function restoreProductDefault(product: ProductTab, options: { save?: boolean } = {}) {
  const defaults = defaultHeaderState[product];
  if (!defaults) return;

  const title = titleFor(product);
  const titleInput = titleInputFor(product);
  const logo = logoFor(product);
  const preview = logoPreviewFor(product);

  if (title) title.innerHTML = defaults.title || '';
  if (title && titleInput) titleInput.value = textFromTitle(title);
  if (logo && defaults.logo) logo.src = defaults.logo;
  if (preview && defaults.logo) preview.src = defaults.logo;
  if (options.save ?? false) scheduleSaveCallback();
}

export function resetHeaderCustomizations(options: { save?: boolean } = {}) {
  (['iul', 'term'] as ProductTab[]).forEach(product => restoreProductDefault(product, options));
}

function syncHeaderLockState() {
  const editable = canEditHeader();
  (['iul', 'term'] as ProductTab[]).forEach(product => {
    const title = titleFor(product);
    const logoPill = logoPillFor(product);
    if (title) {
      title.contentEditable = editable ? 'true' : 'false';
      title.classList.toggle('entitlement-locked', !editable);
    }
    if (logoPill) {
      logoPill.classList.toggle('entitlement-locked', !editable);
      logoPill.title = editable ? 'Click để đổi logo' : 'Upgrade tier to unlock logo editing';
    }
    if (entitlementsLoaded() && !editable) restoreProductDefault(product, { save: false });
  });
}

export function syncHeaderEntitlementState() {
  syncHeaderLockState();
}

async function authorizeHeaderEdit() {
  await authorizeFeatureUse('branding', 'Header / Logo');
  syncHeaderLockState();
  return canEditHeader();
}

function handleHeaderAuthorizationError(error: unknown) {
  syncHeaderLockState();
  alert((error as Error).message || error);
}

export function setHeaderTitle(product: ProductTab, value: string, options: { save?: boolean; allowLocked?: boolean } = {}) {
  if (!options.allowLocked && entitlementsLoaded() && !canEditHeader()) {
    restoreProductDefault(product, { save: false });
    return;
  }

  const title = titleFor(product);
  const input = titleInputFor(product);
  if (!title) return;

  title.innerHTML = htmlFromTitleText(value);
  if (input && input.value !== value) input.value = value;
  if (options.save ?? true) scheduleSaveCallback();
}

function syncEditorTitleFromPreview(product: ProductTab) {
  const title = titleFor(product);
  const input = titleInputFor(product);
  if (!title || !input) return;
  input.value = textFromTitle(title);
  scheduleSaveCallback();
}

export function setHeaderLogo(product: ProductTab, dataUrl: string, options: { save?: boolean } = {}) {
  if (entitlementsLoaded() && !canEditHeader()) {
    restoreProductDefault(product, { save: false });
    return;
  }

  const logo = logoFor(product);
  const preview = logoPreviewFor(product);
  if (!dataUrl) return;

  if (logo) logo.src = dataUrl;
  if (preview) preview.src = dataUrl;
  if (options.save ?? true) scheduleSaveCallback();
}

function syncLogoPreview(product: ProductTab) {
  const logo = logoFor(product);
  const preview = logoPreviewFor(product);
  if (logo?.src && preview) preview.src = logo.src;
}

function readLogoFile(product: ProductTab, file: File | null | undefined) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') setHeaderLogo(product, reader.result);
  };
  reader.readAsDataURL(file);
}

function ensurePreviewLogoInput(product: ProductTab) {
  const existing = logoPreviewInputFor(product);
  if (existing) return existing;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.id = CONFIG[product].logoPreviewInputId;
  input.className = 'header-logo-file';
  input.setAttribute('aria-label', `Upload ${product.toUpperCase()} header logo`);
  document.body.appendChild(input);
  return input;
}

function bindProduct(product: ProductTab) {
  const title = titleFor(product);
  const titleInput = titleInputFor(product);
  const logoInput = logoInputFor(product);
  const previewLogoInput = ensurePreviewLogoInput(product);
  const logoPill = logoPillFor(product);

  if (title) {
    title.contentEditable = canEditHeader() ? 'true' : 'false';
    title.spellcheck = false;
    title.addEventListener('focus', () => {
      if (!canEditHeader()) return;
      authorizeHeaderEdit().catch(handleHeaderAuthorizationError);
    });
    title.addEventListener('input', () => {
      if (!canEditHeader()) {
        restoreProductDefault(product, { save: false });
        return;
      }
      syncEditorTitleFromPreview(product);
    });
    title.addEventListener('blur', () => {
      if (!canEditHeader()) {
        restoreProductDefault(product, { save: false });
        return;
      }
      syncEditorTitleFromPreview(product);
    });
  }

  if (titleInput) {
    const currentTitle = title ? textFromTitle(title) : titleInput.value;
    if (currentTitle) titleInput.value = currentTitle;
    titleInput.addEventListener('focus', () => {
      if (!canEditHeader()) return;
      authorizeHeaderEdit().catch(handleHeaderAuthorizationError);
    });
    titleInput.addEventListener('input', () => setHeaderTitle(product, titleInput.value));
  }

  if (logoInput) {
    logoInput.addEventListener('change', async () => {
      try {
        if (await authorizeHeaderEdit()) readLogoFile(product, logoInput.files?.[0]);
      } catch (error) {
        handleHeaderAuthorizationError(error);
      }
      logoInput.value = '';
    });
  }

  previewLogoInput.addEventListener('change', async () => {
    try {
      if (await authorizeHeaderEdit()) readLogoFile(product, previewLogoInput.files?.[0]);
    } catch (error) {
      handleHeaderAuthorizationError(error);
    }
    previewLogoInput.value = '';
  });

  document.querySelectorAll(`[data-header-logo-trigger="${product}"]`).forEach(btn => {
    btn.addEventListener('click', () => {
      authorizeHeaderEdit()
        .then(allowed => {
          if (allowed) logoInput?.click();
        })
        .catch(handleHeaderAuthorizationError);
    });
  });

  if (logoPill) {
    logoPill.dataset.headerLogoPicker = product;
    logoPill.title = canEditHeader() ? 'Click để đổi logo' : 'Upgrade tier to unlock logo editing';
    logoPill.addEventListener('click', () => {
      authorizeHeaderEdit()
        .then(allowed => {
          if (allowed) previewLogoInput.click();
        })
        .catch(handleHeaderAuthorizationError);
    });
  }

  syncLogoPreview(product);
}

export function bindHeaderEditor() {
  bindProduct('iul');
  bindProduct('term');
  window.addEventListener('manle:account-rendered', syncHeaderEntitlementState);
  syncHeaderEntitlementState();
}

export function captureHeaderState() {
  const capture = (product: ProductTab): HeaderState => {
    if (entitlementsLoaded() && !canEditHeader()) {
      return defaultHeaderState[product] || captureProductHeader(product);
    }
    return captureProductHeader(product);
  };

  return {
    iul: capture('iul'),
    term: capture('term'),
  };
}

export function restoreHeaderState(data: any) {
  if (!data || typeof data !== 'object') return;
  if (entitlementsLoaded() && !canEditHeader()) {
    resetHeaderCustomizations({ save: false });
    return;
  }

  (['iul', 'term'] as ProductTab[]).forEach(product => {
    const item = data[product];
    if (!item || typeof item !== 'object') return;

    const title = titleFor(product);
    if (title && item.title) title.innerHTML = item.title;
    if (item.logo) setHeaderLogo(product, item.logo, { save: false });
  });
}
