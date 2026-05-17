type CustomSelectElement = HTMLSelectElement & {
  _customDDL?: {
    root: HTMLElement;
    trigger: HTMLButtonElement;
    valueEl: HTMLElement;
    menu: HTMLElement;
  };
};

function getOptionLabel(select: HTMLSelectElement) {
  const option = select.selectedOptions[0] || select.options[select.selectedIndex];
  return option ? option.textContent?.trim() || option.value : '';
}

function closeDropdown(root: HTMLElement) {
  root.classList.remove('is-open');
  const trigger = root.querySelector<HTMLButtonElement>('.custom-ddl-trigger');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

function closeOtherDropdowns(activeRoot?: HTMLElement) {
  document.querySelectorAll<HTMLElement>('.custom-ddl.is-open').forEach(root => {
    if (root !== activeRoot) closeDropdown(root);
  });
}

function syncCustomDropdown(select: CustomSelectElement) {
  const ddl = select._customDDL;
  if (!ddl) return;
  ddl.valueEl.textContent = getOptionLabel(select);
  ddl.menu.querySelectorAll<HTMLElement>('.custom-ddl-option').forEach(item => {
    const selected = item.dataset.value === select.value;
    item.classList.toggle('is-selected', selected);
    item.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
}

function selectOption(select: CustomSelectElement, value: string) {
  if (select.value === value) {
    syncCustomDropdown(select);
    return;
  }
  select.value = value;
  syncCustomDropdown(select);
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function moveSelection(select: CustomSelectElement, dir: number) {
  const options = Array.from(select.options).filter(opt => !opt.disabled);
  if (options.length === 0) return;
  const currentIndex = Math.max(0, options.findIndex(opt => opt.value === select.value));
  const nextIndex = (currentIndex + dir + options.length) % options.length;
  selectOption(select, options[nextIndex].value);
}

function buildCustomDropdown(select: CustomSelectElement) {
  if (select._customDDL) {
    syncCustomDropdown(select);
    return;
  }

  const root = document.createElement('div');
  root.className = 'custom-ddl';
  root.dataset.selectId = select.id || '';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-ddl-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const valueEl = document.createElement('span');
  valueEl.className = 'custom-ddl-value';

  const arrow = document.createElement('span');
  arrow.className = 'custom-ddl-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '▾';

  trigger.append(valueEl, arrow);

  const menu = document.createElement('div');
  menu.className = 'custom-ddl-menu';
  menu.setAttribute('role', 'listbox');

  Array.from(select.options).forEach(option => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'custom-ddl-option';
    item.dataset.value = option.value;
    item.textContent = option.textContent || option.value;
    item.setAttribute('role', 'option');
    if (option.disabled) item.disabled = true;
    item.addEventListener('click', () => {
      selectOption(select, option.value);
      closeDropdown(root);
      trigger.focus();
    });
    menu.appendChild(item);
  });

  trigger.addEventListener('click', () => {
    const nextOpen = !root.classList.contains('is-open');
    closeOtherDropdowns(root);
    root.classList.toggle('is-open', nextOpen);
    trigger.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
  });

  trigger.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeDropdown(root);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(select, event.key === 'ArrowDown' ? 1 : -1);
      root.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      trigger.click();
    }
  });

  select.addEventListener('change', () => syncCustomDropdown(select));
  select.classList.add('custom-ddl-source');
  select.setAttribute('aria-hidden', 'true');
  select.tabIndex = -1;

  root.append(trigger, menu);
  select.after(root);
  select._customDDL = { root, trigger, valueEl, menu };
  syncCustomDropdown(select);
}

let isBound = false;
export function bindCustomDropdowns() {
  document.querySelectorAll<CustomSelectElement>('select').forEach(buildCustomDropdown);
  if (isBound) return;
  isBound = true;

  document.addEventListener('click', event => {
    const target = event.target as Element | null;
    if (target?.closest('.custom-ddl')) return;
    closeOtherDropdowns();
  });
}

export function refreshCustomDropdowns() {
  document.querySelectorAll<CustomSelectElement>('select').forEach(syncCustomDropdown);
}

