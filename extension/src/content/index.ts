// ============================================================
// Content Script V3 - 增强版页面注入脚本
// 新增：自定义下拉/日期组件驱动、单选组、字段锚点、异步填充
// 支持：antd / Element UI(Plus) / Arco / 原生控件 / 通用 ARIA
// ============================================================

import type { FormField, FillFieldResult, WidgetKind } from '../types/models';

// =================== ATS 检测（内联版） ===================

interface DetectedATS {
  name: string;
  formSelector: string;
  labelStrategy: 'ant' | 'element' | 'moka' | 'standard';
  loadDelay: number;
}

function detectCurrentATS(): DetectedATS | null {
  const url = window.location.href;
  const html = document.body?.innerHTML?.substring(0, 3000) || '';

  // 北森
  if (/\.italent\.cn|\.beisen\.com|italentx\.|career\.beisen/.test(url) ||
      /italent|beisen/.test(html.toLowerCase())) {
    return {
      name: '北森 iTalentX',
      formSelector: 'input, select, textarea, .ant-input, .ant-select .ant-select-selection-search-input, [contenteditable="true"]',
      labelStrategy: 'ant',
      loadDelay: 2000,
    };
  }

  // Moka
  if (/\.mokahr\.com|\.moka\.com|career\.moka/.test(url)) {
    return {
      name: 'Moka',
      formSelector: 'input, select, textarea, .moka-input, .moka-select, [contenteditable="true"]',
      labelStrategy: 'moka',
      loadDelay: 1500,
    };
  }

  // 智联
  if (/\.zhaopin\.com/.test(url)) {
    return { name: '智联招聘', formSelector: '', labelStrategy: 'standard', loadDelay: 1000 };
  }

  // 牛客
  if (/\.nowcoder\.com/.test(url)) {
    return { name: '牛客网', formSelector: '', labelStrategy: 'standard', loadDelay: 1000 };
  }

  // Greenhouse
  if (/greenhouse\.io/.test(url)) {
    return {
      name: 'Greenhouse',
      formSelector: '#application-form input, #application-form select, #application-form textarea',
      labelStrategy: 'standard',
      loadDelay: 500,
    };
  }

  // Element UI / Ant Design 检测
  if (document.querySelector('.ant-form, .ant-input, [class*="ant-"]')) {
    return { name: 'Ant Design SPA', formSelector: '', labelStrategy: 'ant', loadDelay: 1500 };
  }

  if (document.querySelector('.el-form, .el-input, [class*="el-"]')) {
    return { name: 'Element UI SPA', formSelector: '', labelStrategy: 'element', loadDelay: 1500 };
  }

  return null;
}

// =================== 选择器常量 ===================

/** 明确的框架下拉/级联容器 */
const FRAMEWORK_SELECT =
  '.ant-select, .el-select, .arco-select, ' +
  '.ant-cascader, .el-cascader, .arco-cascader, ' +
  '.ant-tree-select, .el-tree-select';

const SELECT_ANCHOR = `${FRAMEWORK_SELECT}, [role="combobox"]`;
const DATE_ANCHOR = '.ant-picker, .el-date-editor, .arco-picker, [class*="date-picker"], [class*="datepicker"]';
const RADIO_ANCHOR = '[role="radiogroup"], .ant-radio-group, .el-radio-group, .arco-radio-group';
const CHECKBOX_ANCHOR = '.ant-checkbox-group, .el-checkbox-group, .arco-checkbox-group';

const CUSTOM_WIDGET_SELECTOR = [
  SELECT_ANCHOR,
  DATE_ANCHOR,
  RADIO_ANCHOR,
  CHECKBOX_ANCHOR,
].join(', ');

const OPTION_SELECTOR =
  '.ant-select-item-option, .el-select-dropdown__item, .arco-select-option, [role="option"]';

const POPUP_ROOT_SELECTOR =
  '.ant-select-dropdown, .el-select-dropdown, .arco-select-popup, ' +
  '.ant-picker-dropdown, .el-picker-panel, .arco-picker-container';

const POPUP_SELECTOR = `${POPUP_ROOT_SELECTOR}, .el-popper, [role="listbox"]`;

const HIDDEN_POPUP_CLASSES = [
  'ant-select-dropdown-hidden',
  'ant-picker-dropdown-hidden',
  'el-select-dropdown__hidden',
  'arco-select-popup-hidden',
];

/** 页面装饰区域与弹层，不参与表单扫描 */
const EXCLUDE_REGION = [
  'nav',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="tooltip"]',
  '[class*="sidebar"]',
  '[class*="side-bar"]',
  '[class*="side-panel"]',
  POPUP_ROOT_SELECTOR,
  '[role="listbox"]',
].join(', ');

/** 选项匹配阈值 */
const MATCH_THRESHOLD = 0.7;

/** 必须是真实原生控件的字段类型 */
const NATIVE_KINDS = new Set<WidgetKind>(['native-select', 'native-date', 'text', 'textarea', 'contenteditable']);

/** 容器内真正可填写的原生控件（跳过 hidden / 按钮类 input） */
const INNER_CONTROL_SELECTOR =
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea, [contenteditable="true"]';

// =================== 工具函数 ===================

let fieldCounter = 0;
function genId(): string {
  return `ca_${Date.now()}_${++fieldCounter}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 轮询等待条件成立，超时返回 null */
async function waitFor<T>(
  fn: () => T | null | undefined | false,
  timeout = 800,
  interval = 40
): Promise<T | null> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = fn();
    if (value) return value as T;
    if (Date.now() >= deadline) return null;
    await sleep(interval);
  }
}

/** 派发 PointerEvent，环境不支持时回落到 MouseEvent */
function firePointer(el: HTMLElement, type: string, init: MouseEventInit): void {
  try {
    el.dispatchEvent(new PointerEvent(type, init));
  } catch {
    el.dispatchEvent(new MouseEvent(type, init));
  }
}

/** 完整鼠标事件序列（框架的合成事件系统需要冒泡的真实序列） */
function dispatchMouseSequence(el: HTMLElement): void {
  const init: MouseEventInit = { bubbles: true, cancelable: true, view: window, button: 0 };
  firePointer(el, 'pointerdown', init);
  el.dispatchEvent(new MouseEvent('mousedown', init));
  firePointer(el, 'pointerup', init);
  el.dispatchEvent(new MouseEvent('mouseup', init));
  el.dispatchEvent(new MouseEvent('click', init));
}

function getXPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body) {
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index++;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(`${current.tagName.toLowerCase()}[${index}]`);
    current = current.parentElement;
  }
  return '//' + parts.join('/');
}

function getCssSelector(element: Element): string {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const path: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector = `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      break;
    }
    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).slice(0, 2)
        .filter(c => !c.startsWith('data-v-') && c.length < 30) // 过滤 Vue scoped 类名
        .map(c => CSS.escape(c)).join('.');
      if (classes) selector += `.${classes}`;
    }
    path.unshift(selector);
    current = current.parentElement;
  }
  return path.join(' > ');
}

// =================== 可见性判定 ===================

function isRendered(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
  return true;
}

function hasLayout(el: HTMLElement): boolean {
  return el.offsetWidth > 0 && el.offsetHeight > 0;
}

/** 严格可见（用于原生控件） */
function isVisible(element: HTMLElement): boolean {
  if (!element.offsetParent && element.tagName !== 'BODY') {
    const style = window.getComputedStyle(element);
    if (style.position !== 'fixed' && style.position !== 'sticky') return false;
  }
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    element.offsetWidth > 0 &&
    element.offsetHeight > 0
  );
}

/**
 * 组件容器可见性（放宽版）
 * 自定义组件的内部输入框常态 opacity:0 / 零尺寸，只有外层容器可见
 */
function isWidgetAnchorVisible(anchor: HTMLElement): boolean {
  return isRendered(anchor) && hasLayout(anchor);
}

// =================== 控件类型识别 ===================

/** 只读且占位符像日期 → 自定义日期组件 */
function isDateLikeReadonlyInput(input: HTMLInputElement | null | undefined): boolean {
  if (!input || input.tagName !== 'INPUT' || !input.readOnly) return false;
  const ph = input.getAttribute('placeholder') || '';
  return /\d{4}|YYYY|yyyy|年|月|日/.test(ph);
}

function isNativeControl(el: HTMLElement): boolean {
  return el.tagName === 'INPUT' || el.tagName === 'SELECT'
    || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

function isComboboxInput(el: HTMLElement): boolean {
  return el.tagName === 'INPUT' && el.getAttribute('role') === 'combobox';
}

/** 取容器内第一个真正可填写的原生控件（跳过 hidden 等不可填控件） */
function findInnerControl(el: HTMLElement): HTMLElement | null {
  return el.querySelector<HTMLElement>(INNER_CONTROL_SELECTOR);
}

function findInnerInput(el: HTMLElement): HTMLInputElement | null {
  if (el.tagName === 'INPUT') return el as HTMLInputElement;
  return el.querySelector<HTMLInputElement>(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])'
  );
}

function detectWidgetKind(el: HTMLElement): WidgetKind {
  const inner = el.tagName === 'INPUT'
    ? (el as HTMLInputElement)
    : findInnerInput(el);
  const type = (inner?.type || (el as HTMLInputElement).type || '').toLowerCase();

  // 原生控件优先识别，避免被外层组件的类名误判
  // （例如原生 <input type="date"> 落在 class 含 date-picker 的容器里）
  if (el.tagName === 'SELECT') return 'native-select';
  if (type === 'date' || type === 'month') return 'native-date';
  if (type === 'radio') return 'radio-group';
  if (type === 'checkbox') return 'checkbox';
  if (el.isContentEditable) return 'contenteditable';
  if (el.tagName === 'TEXTAREA') return 'textarea';

  // 明确的框架下拉容器（先于日期判断，避免 Element 下拉的日期型 placeholder 误判）
  if (el.closest(FRAMEWORK_SELECT)) return 'custom-select';
  // 日期组件容器
  if (el.closest(DATE_ANCHOR)) return 'custom-date';
  // 独立的只读日期输入框
  if (isDateLikeReadonlyInput(inner)) return 'custom-date';
  // 裸 combobox 输入框：可输入的直接当文本框（自动完成类），只读且声明了弹层才当下拉
  if (isComboboxInput(el)) {
    return (el as HTMLInputElement).readOnly && el.getAttribute('aria-haspopup') === 'listbox'
      ? 'custom-select'
      : 'text';
  }
  if (el.closest(SELECT_ANCHOR)) return 'custom-select';
  return 'text';
}

function lowestCommonAncestor(els: HTMLElement[]): HTMLElement | null {
  if (!els.length) return null;
  let current: HTMLElement | null = els[0].parentElement;
  while (current) {
    const node: HTMLElement = current;
    if (els.every((e) => node.contains(e))) return node;
    current = current.parentElement;
  }
  return null;
}

function resolveRadioGroupContainer(radio: HTMLInputElement): HTMLElement {
  const explicit = radio.closest(RADIO_ANCHOR);
  if (explicit) return explicit as HTMLElement;

  const formItem = radio.closest('.ant-form-item, .el-form-item, .arco-form-item, [class*="form-item"]:not([class*="form-items"]), fieldset');
  if (formItem) {
    const all = Array.from(formItem.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    const namedGroups = new Set(all.map((r) => r.getAttribute('name') || '').filter(Boolean));

    // 容器里混着多个不同名的分组 → 不能整体当成一组
    if (namedGroups.size <= 1) {
      // 没有 name 时再按「同一个直接父容器」细分，避免一道容器装两道单选题
      if (namedGroups.size === 0 && all.length > 2) {
        const parent = radio.parentElement;
        const siblings = all.filter((r) => r.parentElement === parent);
        if (siblings.length >= 2 && parent) return parent;
      }
      return formItem as HTMLElement;
    }
  }

  const name = radio.getAttribute('name');
  if (name) {
    const peers = Array.from(
      document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`)
    );
    const lca = lowestCommonAncestor([radio, ...peers.filter((p) => p !== radio)]);
    // 同名 radio 若散布在整页（LCA 过大），说明是多个独立分组，不能合并
    if (lca && lca !== document.body && lca !== document.documentElement
      && lca.querySelectorAll('input[type="radio"]').length === peers.length) {
      return lca;
    }
  }
  return (radio.parentElement as HTMLElement) || radio;
}

function resolveCheckboxGroupContainer(checkbox: HTMLInputElement): HTMLElement {
  const explicit = checkbox.closest(CHECKBOX_ANCHOR);
  if (explicit) return explicit as HTMLElement;

  const formItem = checkbox.closest('.ant-form-item, .el-form-item, .arco-form-item, [class*="form-item"]:not([class*="form-items"]), fieldset');
  if (formItem) return formItem as HTMLElement;

  const name = checkbox.getAttribute('name');
  if (name) {
    const peers = Array.from(
      document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${CSS.escape(name)}"]`)
    );
    const lca = lowestCommonAncestor([checkbox, ...peers.filter((p) => p !== checkbox)]);
    if (lca && lca !== document.body && lca !== document.documentElement) return lca;
  }
  return (checkbox.parentElement as HTMLElement) || checkbox;
}

/**
 * 复选控件锚点：
 * - 多个同名 checkbox → 锚到组容器（整体作为一个字段）
 * - 单个 checkbox → 锚到它自己的可见包裹元素（避免与相邻复选合并）
 */
function resolveCheckboxAnchor(checkbox: HTMLInputElement): HTMLElement {
  const explicitGroup = checkbox.closest(CHECKBOX_ANCHOR);
  if (explicitGroup) return explicitGroup as HTMLElement;

  const container = resolveCheckboxGroupContainer(checkbox);
  const boxes = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
  if (boxes.length >= 2) {
    const names = new Set(boxes.map((b) => b.getAttribute('name') || ''));
    if (names.size === 1) return container;
  }
  return getControlWrapper(checkbox);
}

/** 把控件元素归一到稳定锚点（框架重建内部 input 时锚点依然存在） */
function resolveAnchor(el: HTMLElement, kind: WidgetKind): HTMLElement {
  switch (kind) {
    case 'custom-select':
      return (el.closest(SELECT_ANCHOR) as HTMLElement) || el;
    case 'custom-date':
      return (el.closest(DATE_ANCHOR) as HTMLElement) || el;
    case 'radio-group':
      return resolveRadioGroupContainer(el as HTMLInputElement);
    case 'checkbox':
    case 'checkbox-group':
      return resolveCheckboxAnchor(el as HTMLInputElement);
    case 'native-select':
    case 'native-date':
    case 'text':
    case 'textarea':
    case 'contenteditable':
      // 外层容器（如 class 含 date-picker 的 div）归一到内部真正的原生控件
      return isNativeControl(el) ? el : (findInnerControl(el) || el);
    default:
      return el;
  }
}

/** 锚点落在组容器上时，把 checkbox 升级为 checkbox-group */
function refineKind(anchor: HTMLElement, kind: WidgetKind): WidgetKind {
  if (kind !== 'checkbox') return kind;
  if (anchor.matches(CHECKBOX_ANCHOR)) return 'checkbox-group';
  const boxes = anchor.querySelectorAll('input[type="checkbox"]');
  if (boxes.length < 2) return kind;
  const names = new Set(Array.from(boxes).map((b) => b.getAttribute('name') || ''));
  return names.size === 1 ? 'checkbox-group' : kind;
}

/** 取出组内同一 name 的控件，避免同名分组跨模块串台 */
function getGroupControls(anchor: HTMLElement, type: 'radio' | 'checkbox'): HTMLInputElement[] {
  const all = Array.from(anchor.querySelectorAll<HTMLInputElement>(`input[type="${type}"]`));
  if (all.length <= 1) return all;
  const name = anchor.getAttribute('name') || all[0].getAttribute('name') || '';
  if (!name) return all;
  const sameName = all.filter((c) => c.getAttribute('name') === name);
  return sameName.length ? sameName : all;
}

/** 锚点元数据丢失时（如页面重渲染）从 DOM 反推控件类型 */
function inferKindFromDom(el: HTMLElement): WidgetKind {
  if (el.tagName === 'SELECT') return 'native-select';
  if (el.isContentEditable) return 'contenteditable';
  if (el.tagName === 'TEXTAREA') return 'textarea';
  if (el.closest(FRAMEWORK_SELECT)) return 'custom-select';
  if (el.closest(DATE_ANCHOR)) return 'custom-date';

  const input = el.tagName === 'INPUT' ? (el as HTMLInputElement) : findInnerInput(el);
  const type = (input?.type || '').toLowerCase();
  if (type === 'radio') return 'radio-group';
  if (type === 'checkbox') return refineKind(el, 'checkbox');
  if (type === 'date' || type === 'month') return 'native-date';
  if (el.closest(SELECT_ANCHOR)) return 'custom-select';
  return 'text';
}

function kindToResultType(kind: WidgetKind): FillFieldResult['type'] {
  switch (kind) {
    case 'custom-select':
    case 'native-select':
      return 'select';
    case 'radio-group':
      return 'radio';
    case 'checkbox':
    case 'checkbox-group':
      return 'checkbox';
    case 'textarea':
      return 'textarea';
    case 'native-date':
    case 'custom-date':
      return 'date';
    default:
      return 'text';
  }
}

function getSelectOptions(element: HTMLSelectElement): string[] {
  return Array.from(element.options)
    .map((opt) => opt.text.trim())
    .filter((t) => t && t !== '请选择' && t !== '-- 请选择 --' && t !== 'Select');
}

function readCurrentValue(anchor: HTMLElement, kind: WidgetKind): string | undefined {
  if (kind === 'custom-select') {
    const shown = anchor.querySelector('.ant-select-selection-item, .el-select__selected-item, .arco-select-view-value');
    return shown?.textContent?.trim() || undefined;
  }
  if (kind === 'custom-date') {
    return findInnerInput(anchor)?.value || undefined;
  }
  if (kind === 'radio-group' || kind === 'checkbox-group') {
    const checked = Array.from(anchor.querySelectorAll<HTMLInputElement>('input:checked'))
      .map((c) => getControlLabel(c))
      .filter(Boolean);
    return checked.length ? checked.join('、') : undefined;
  }
  if (anchor.tagName === 'INPUT' || anchor.tagName === 'TEXTAREA') {
    return (anchor as HTMLInputElement).value || undefined;
  }
  return undefined;
}

// =================== 增强版 Label 提取 ===================

function findLabel(element: HTMLElement, ats: DetectedATS | null): string {
  // ===== ATS 专用 label 策略 =====

  // Ant Design 系统（北森等）
  if (ats?.labelStrategy === 'ant') {
    const formItem = element.closest('.ant-form-item, .ant-row');
    if (formItem) {
      const label = formItem.querySelector('.ant-form-item-label label, .ant-form-item-label > span');
      if (label?.textContent?.trim()) {
        return cleanLabel(label.textContent.trim());
      }
    }
  }

  // Element UI 系统
  if (ats?.labelStrategy === 'element') {
    const formItem = element.closest('.el-form-item');
    if (formItem) {
      const label = formItem.querySelector('.el-form-item__label');
      if (label?.textContent?.trim()) {
        return cleanLabel(label.textContent.trim());
      }
    }
  }

  // Moka 系统
  if (ats?.labelStrategy === 'moka') {
    const formItem = element.closest('.form-field, .field-group, [class*="form-item"]');
    if (formItem) {
      const label = formItem.querySelector('.field-label, .form-label, label');
      if (label?.textContent?.trim()) {
        return cleanLabel(label.textContent.trim());
      }
    }
  }

  // ===== 通用 label 提取策略 =====

  // 1. 通过 for 属性关联的 label
  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label?.textContent) return cleanLabel(label.textContent.trim());
  }

  // 2. 包裹在 form-item / form-group 容器中的 label
  const formItemSelectors = [
    '.form-item', '.form-group', '.form-field',
    '[class*="form-item"]', '[class*="form-group"]', '[class*="field-wrap"]',
    '.ant-form-item', '.el-form-item',
    'tr', // 表格布局
  ];
  for (const sel of formItemSelectors) {
    const container = element.closest(sel);
    if (container) {
      const label = container.querySelector('label, .label, [class*="label"]:not(input):not(select):not(textarea)');
      if (label && label !== element && label.textContent?.trim()) {
        const text = cleanLabel(label.textContent.trim());
        if (text.length > 0 && text.length < 50) return text;
      }
    }
  }

  // 3. 父级 label 包裹
  const parentLabel = element.closest('label');
  if (parentLabel?.textContent) {
    const text = cleanLabel(parentLabel.textContent.trim());
    const val = (element as HTMLInputElement).value || '';
    const cleaned = text.replace(val, '').trim();
    if (cleaned) return cleaned;
  }

  // 4. 前一个兄弟
  let prev = element.previousElementSibling;
  while (prev) {
    if (['SPAN', 'DIV', 'LABEL', 'P', 'TD', 'TH', 'DT', 'STRONG', 'EM' ].includes(prev.tagName)) {
      const text = prev.textContent?.trim();
      if (text && text.length > 0 && text.length < 50 && !prev.querySelector('input, select, textarea')) {
        return cleanLabel(text);
      }
    }
    prev = prev.previousElementSibling;
  }

  // 5. aria-label, title, placeholder
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return cleanLabel(ariaLabel);

  const title = element.getAttribute('title');
  if (title && title.length < 50) return cleanLabel(title);

  const placeholder = element.getAttribute('placeholder');
  if (placeholder && placeholder.length < 40 && !placeholder.includes('输入') && placeholder !== '请选择') {
    return cleanLabel(placeholder);
  }

  // 6. name 属性的中文化映射
  const name = element.getAttribute('name') || '';
  if (name) {
    const nameMap: Record<string, string> = {
      name: '姓名', username: '姓名', realname: '姓名', fullname: '姓名',
      phone: '手机号码', mobile: '手机号码', tel: '电话', telephone: '电话',
      email: '邮箱', mail: '邮箱',
      gender: '性别', sex: '性别',
      birthday: '出生日期', birth: '出生日期', birthdate: '出生日期',
      school: '学校', university: '学校', college: '学院',
      major: '专业', degree: '学历',
      company: '公司', organization: '公司',
      position: '岗位', title: '职位', role: '角色',
      address: '地址', city: '城市',
      idcard: '身份证号', idnumber: '身份证号',
    };
    const mapped = nameMap[name.toLowerCase().replace(/[_-]/g, '')];
    if (mapped) return mapped;
    return name;
  }

  return '未知字段';
}

/** 优先从表单容器上取标签（锚点是组件容器时更准确） */
function findLabelForWidget(anchor: HTMLElement, ats: DetectedATS | null): string {
  const formItem = anchor.closest('.ant-form-item, .el-form-item, .arco-form-item');
  if (formItem) {
    const label = formItem.querySelector(
      '.ant-form-item-label label, .ant-form-item-label > span, .el-form-item__label, .arco-form-item-label-col label, .arco-form-item-label-col'
    );
    if (label?.textContent?.trim()) return cleanLabel(label.textContent.trim());
  }
  return findLabel(anchor, ats);
}

/** 清理 label 文本 */
function cleanLabel(text: string): string {
  return text
    .replace(/[*：:]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\n]+|[\s\n]+$/g, '')
    .replace(/请输入|请选择|请填写|（必填）|（选填）|\(必填\)|\(选填\)|必填|选填/g, '')
    .trim();
}

/** 取单个 radio/checkbox 的可见文字 */
function getControlLabel(input: HTMLInputElement): string {
  if (input.id) {
    const byFor = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (byFor?.textContent?.trim()) return cleanLabel(byFor.textContent.trim());
  }
  const aria = input.getAttribute('aria-label');
  if (aria?.trim()) return cleanLabel(aria.trim());

  const wrap = input.closest(
    'label, .ant-radio-wrapper, .el-radio, .arco-radio, .ant-checkbox-wrapper, .el-checkbox, .arco-checkbox'
  );
  if (wrap?.textContent?.trim()) return cleanLabel(wrap.textContent.trim());

  // 无 label 包裹：文字常是紧随其后的文本节点（<input>是<input>否）
  const nextNode = input.nextSibling;
  if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
    const text = (nextNode.textContent || '').trim();
    if (text) return cleanLabel(text);
  }

  const sibling = input.nextElementSibling;
  if (sibling?.textContent?.trim()) return cleanLabel(sibling.textContent.trim());

  const parent = input.parentElement;
  const parentText = parent?.textContent?.replace(input.value, '').trim() || '';
  if (parentText && parentText.length < 20) return cleanLabel(parentText);

  return cleanLabel(input.value || '');
}

function isRequiredWidget(anchor: HTMLElement): boolean {
  if (anchor.hasAttribute('required') || anchor.getAttribute('aria-required') === 'true') return true;
  const formItem = anchor.closest('.ant-form-item, .el-form-item, .arco-form-item, [class*="form-item"]');
  if (formItem && formItem.querySelector('.ant-form-item-required, .el-form-item__label.is-required, [class*="required"]')) {
    return true;
  }
  return false;
}

// =================== 获取模块上下文 ===================

function getSectionContext(element: HTMLElement): string {
  let current: HTMLElement | null = element;
  for (let i = 0; i < 15 && current; i++) {
    current = current.parentElement;
    if (!current) break;

    // 优先取「容器的直接子标题」：这样最近的分区标题才会胜出，
    // 不会因为上层大容器里有多个标题而取到第一个分区的标题
    const direct = current.querySelector(
      ':scope > legend, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, ' +
      ':scope > .title, :scope > .header, :scope > [class*="title"], :scope > [class*="header"]'
    );
    if (direct?.textContent?.trim() && direct.textContent.trim().length < 50) {
      return direct.textContent.trim();
    }

    // 其次：分区级容器内的首个标题
    const sectionSelectors = 'fieldset, section, [class*="section"], [class*="module"], [class*="block"], [class*="panel"], [class*="group"]';
    if (current.matches(sectionSelectors)) {
      const heading = current.querySelector('legend, h1, h2, h3, h4, h5, .title, .header, [class*="title"], [class*="header"]');
      if (heading?.textContent?.trim() && heading.textContent.trim().length < 50) {
        return heading.textContent.trim();
      }
    }
  }

  // 兜底：取文档顺序中位于该字段之前、最近的一个标题（排除导航/侧栏等装饰区域）
  const headings = Array.from(document.querySelectorAll<HTMLElement>(
    'h1, h2, h3, h4, h5, legend, [class*="section-title"], [class*="sectionTitle"], [class*="section_title"]'
  ));
  let nearest = '';
  for (const heading of headings) {
    const follows = (heading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    if (follows) break;
    if (heading.closest(EXCLUDE_REGION)) continue;
    const text = (heading.textContent || '').trim();
    if (text && text.length < 50) nearest = text;
  }
  return nearest;
}

// =================== 选项文本匹配 ===================

/** 常见字段值的同义选项别名 */
const OPTION_ALIASES: Record<string, string[]> = {
  '男': ['男', '男性', 'male', 'm'],
  '女': ['女', '女性', 'female', 'f'],
  '本科': ['本科', '大学本科', '学士', 'bachelor', 'undergraduate'],
  '硕士': ['硕士', '硕士研究生', '研究生', 'master'],
  '博士': ['博士', '博士研究生', 'phd', 'doctor'],
  '全日制': ['全日制', '统招', '普通全日制'],
  '非全日制': ['非全日制', '在职'],
  '群众': ['群众', '普通群众'],
  '共青团员': ['共青团员', '团员'],
  '中共党员': ['中共党员', '党员', '中国共产党党员'],
  '中共预备党员': ['中共预备党员', '预备党员'],
  '是': ['是', 'yes', 'y', '接受', '同意', '可以'],
  '否': ['否', 'no', 'n', '不接受', '不同意', '不可以'],
};

function normalizeOptionText(s: string): string {
  return s
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)) // 全角转半角
    .replace(/\s+/g, '')
    .replace(/[（）()【】\[\]、,，。.·:：]/g, '')
    .replace(/^(请选择|请填写|请输入)/, '')
    .toLowerCase();
}

const NEGATION_PREFIXES = ['不', '非', '无', '未'];

/**
 * 否定前缀冲突判定：「接受」与「不接受」、「是」与「不是」不能互相匹配，
 * 否则会把「否」填成「接受」这种反向结果
 */
function negationConflict(a: string, b: string): boolean {
  const strip = (s: string) => s.replace(/^[不非无未]/, '');
  const aNeg = NEGATION_PREFIXES.some((n) => a.startsWith(n));
  const bNeg = NEGATION_PREFIXES.some((n) => b.startsWith(n));
  if (aNeg === bNeg) return false;
  const sa = strip(a);
  const sb = strip(b);
  if (!sa || !sb) return false;
  return sa === sb || sa.includes(sb) || sb.includes(sa);
}

/** 拉丁字母要求词边界，避免 male 命中 female */
function latinWordMatch(needle: string, haystack: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
}

/** 别名与选项文本是否等价 */
function aliasMatchesOption(alias: string, text: string): boolean {
  const na = normalizeOptionText(alias);
  const t = normalizeOptionText(text);
  if (!na || !t) return false;
  if (negationConflict(na, t)) return false;
  if (na === t) return true;
  if (/[\u4e00-\u9fa5]/.test(na)) {
    // 中文别名至少两个字才允许包含匹配（「是」「否」只认完全相等）
    return na.length >= 2 && t.includes(na);
  }
  return latinWordMatch(na, t);
}

/** 薪资等区间值的数值重叠匹配 */
function numericRangeScore(value: string, text: string): number {
  const vn = (value.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  const tn = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  if (vn.length < 2 || tn.length < 1) return 0;
  const lo = Math.min(...vn);
  const hi = Math.max(...vn);
  return tn.every((n) => n >= lo && n <= hi) ? 0.75 : 0;
}

function scoreOptionText(value: string, text: string): number {
  const v = normalizeOptionText(value);
  const t = normalizeOptionText(text);
  if (!v || !t) return 0;
  if (v === t) return 1;
  if (negationConflict(v, t)) return 0;
  if (t.includes(v) || v.includes(t)) {
    return 0.7 + 0.3 * (Math.min(v.length, t.length) / Math.max(v.length, t.length));
  }
  return numericRangeScore(value, text);
}

function aliasScore(value: string, text: string): number {
  const key = value.trim();
  const aliases = OPTION_ALIASES[key] || OPTION_ALIASES[normalizeOptionText(key)];
  if (!aliases) return 0;
  return aliases.some((a) => aliasMatchesOption(a, text)) ? 0.95 : 0;
}

function bestMatchScore(value: string, text: string): number {
  return Math.max(scoreOptionText(value, text), aliasScore(value, text));
}

// =================== 弹层辅助 ===================

function normalizePopup(el: HTMLElement): HTMLElement {
  // Element 的 .el-popper 包着 .el-select-dropdown，两者都要归一到同一个根，
  // 否则同一次展开会被当成两个新弹层
  const inner = el.querySelector<HTMLElement>(POPUP_ROOT_SELECTOR);
  if (inner) return inner;
  const root = el.closest(POPUP_ROOT_SELECTOR);
  return (root as HTMLElement) || el;
}

function getVisiblePopups(): HTMLElement[] {
  const found = new Set<HTMLElement>();
  document.querySelectorAll<HTMLElement>(POPUP_SELECTOR).forEach((popup) => {
    if (HIDDEN_POPUP_CLASSES.some((c) => popup.classList.contains(c))) return;
    if (!isRendered(popup) || !hasLayout(popup)) return;
    found.add(normalizePopup(popup));
  });
  return Array.from(found);
}

async function closeAllPopups(): Promise<void> {
  document.body.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })
  );
  await sleep(40);
}

interface SelectParts {
  searchInput: HTMLInputElement | null;
  clickTarget: HTMLElement;
}

function resolveSelectParts(anchor: HTMLElement): SelectParts {
  const searchInput = anchor.tagName === 'INPUT'
    ? (anchor as HTMLInputElement)
    : anchor.querySelector<HTMLInputElement>(
        '.ant-select-selection-search-input, input[role="combobox"], .el-select__input, .arco-select-view-input, ' +
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])'
      );
  const clickTarget = anchor.querySelector<HTMLElement>(
    '.ant-select-selector, .el-select__wrapper, .el-input__wrapper, .arco-select-view, [role="combobox"]'
  ) || searchInput || anchor;
  return { searchInput, clickTarget };
}

function openSelect(anchor: HTMLElement, parts: SelectParts): void {
  try {
    anchor.scrollIntoView({ block: 'center', inline: 'nearest' });
  } catch {
    /* ignore */
  }
  const target = parts.clickTarget;
  const init: MouseEventInit = { bubbles: true, cancelable: true, view: window, button: 0 };
  firePointer(target, 'pointerdown', init);
  target.dispatchEvent(new MouseEvent('mousedown', init)); // antd 在 mousedown 展开
  try {
    parts.searchInput?.focus({ preventScroll: true }); // 部分组件在 focus 时展开
  } catch {
    /* ignore */
  }
  firePointer(target, 'pointerup', init);
  target.dispatchEvent(new MouseEvent('mouseup', init));
  target.dispatchEvent(new MouseEvent('click', init)); // Element / Arco 在 click 展开
}

async function closeSelect(parts: SelectParts): Promise<void> {
  const host = (parts.searchInput || parts.clickTarget) as HTMLElement;
  host.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true, cancelable: true, key: 'Escape', keyCode: 27, which: 27,
  }));
  document.body.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })
  );
  try {
    host.blur();
  } catch {
    /* ignore */
  }
  await sleep(60);
}

function findPopupForAnchor(anchor: HTMLElement, parts: SelectParts, before: Set<HTMLElement>): HTMLElement | null {
  // 1) aria-controls / aria-owns 精确关联
  const ariaId = parts.searchInput?.getAttribute('aria-controls')
    || parts.searchInput?.getAttribute('aria-owns')
    || anchor.getAttribute('aria-controls');
  if (ariaId) {
    const owned = document.getElementById(ariaId);
    if (owned && isRendered(owned) && hasLayout(owned)) return normalizePopup(owned as HTMLElement);
  }

  // 2) 新出现的弹层
  const fresh = getVisiblePopups().filter((p) => !before.has(p));
  if (fresh.length === 1) return fresh[0];
  if (fresh.length > 1) {
    // 3) 取离锚点最近的
    const rect = anchor.getBoundingClientRect();
    return fresh.sort((a, b) =>
      Math.abs(a.getBoundingClientRect().top - rect.bottom) -
      Math.abs(b.getBoundingClientRect().top - rect.bottom)
    )[0];
  }
  return null;
}

// =================== 自定义下拉填充 ===================

interface OptionHit {
  el: HTMLElement;
  text: string;
  score: number;
}

function pickBestOption(popup: HTMLElement, value: string): OptionHit | null {
  let best: OptionHit | null = null;
  for (const opt of getNavigableOptions(popup)) {
    const text = (opt.textContent || '').trim();
    if (!text) continue;
    const score = bestMatchScore(value, text);
    if (!best || score > best.score) best = { el: opt, text, score };
  }
  return best;
}

async function findOptionInPopup(popup: HTMLElement, value: string): Promise<OptionHit | null> {
  const first = pickBestOption(popup, value);
  if (first && first.score >= MATCH_THRESHOLD) return first;

  // 虚拟列表只渲染可见行，分步滚动扫描
  const scroller = popup.querySelector<HTMLElement>(
    '.rc-virtual-list-holder, .el-select-dropdown__wrap, .arco-select-popup-inner, [class*="virtual-list"]'
  );
  if (scroller && scroller.scrollHeight > scroller.clientHeight) {
    const max = scroller.scrollHeight - scroller.clientHeight;
    for (let y = 0; y <= max; y += 200) {
      scroller.scrollTop = y;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      await sleep(60);
      const current = pickBestOption(popup, value);
      if (current && current.score >= MATCH_THRESHOLD) {
        scroller.scrollTop = 0;
        return current;
      }
    }
    scroller.scrollTop = 0;
  }

  return first && first.score >= MATCH_THRESHOLD ? first : null;
}

function clickOption(opt: HTMLElement): void {
  try {
    opt.scrollIntoView({ block: 'nearest' });
  } catch {
    /* ignore */
  }
  const target = opt.querySelector<HTMLElement>(
    '.ant-select-item-option-content, .el-select-dropdown__item span, .arco-select-option-content'
  ) || opt;
  dispatchMouseSequence(target);
}

function typeToFilter(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  input.focus({ preventScroll: true });
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function isSelectionApplied(anchor: HTMLElement, text: string, typedIntoInput: boolean): boolean {
  const want = normalizeOptionText(text);
  if (!want) return false;

  const displayNodes = anchor.querySelectorAll<HTMLElement>(
    '.ant-select-selection-item, .el-select__selected-item, .arco-select-view-value'
  );
  for (const node of Array.from(displayNodes)) {
    const shown = normalizeOptionText((node.textContent || '').trim());
    if (shown && (shown === want || shown.includes(want) || want.includes(shown))) return true;
  }

  // 输入框本身承载选中值（Element UI v2 等），但输入过筛选词时不可信
  if (!typedIntoInput) {
    const current = normalizeOptionText(findInnerInput(anchor)?.value || '');
    if (current && (current === want || current.includes(want) || want.includes(current))) return true;
  }

  return false;
}

/** 可被键盘导航的选项（与 pickBestOption 的过滤条件保持一致，保证索引对齐） */
function getNavigableOptions(popup: HTMLElement): HTMLElement[] {
  return Array.from(popup.querySelectorAll<HTMLElement>(OPTION_SELECTOR)).filter((opt) => {
    if (opt.getAttribute('aria-disabled') === 'true' || opt.hasAttribute('disabled')) return false;
    if (opt.classList.contains('ant-select-item-option-disabled')) return false;
    if (opt.classList.contains('is-disabled')) return false;
    return true;
  });
}

async function selectByKeyboard(
  input: HTMLInputElement | null,
  popup: HTMLElement,
  optionEl: HTMLElement
): Promise<void> {
  if (!input) return;
  const index = getNavigableOptions(popup).indexOf(optionEl);
  if (index < 0) return;

  input.focus({ preventScroll: true });
  for (let i = 0; i <= index; i++) {
    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, key: 'ArrowDown', keyCode: 40, which: 40,
    }));
    await sleep(30);
  }
  input.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true, cancelable: true, key: 'Enter', keyCode: 13, which: 13,
  }));
}

async function fillCustomSelect(anchor: HTMLElement, value: string): Promise<FillOutcome> {
  const parts = resolveSelectParts(anchor);
  await closeAllPopups();
  const before = new Set(getVisiblePopups());

  openSelect(anchor, parts);

  let popup = await waitFor(() => findPopupForAnchor(anchor, parts, before), 800, 40);
  if (!popup && anchor.querySelector(OPTION_SELECTOR)) popup = anchor; // 弹层内联在锚点里
  if (!popup) {
    await closeSelect(parts);
    return { ok: false, error: '下拉框未能展开' };
  }

  let typedIntoInput = false;
  let hit = await findOptionInPopup(popup, value);

  if (!hit && parts.searchInput && !parts.searchInput.readOnly) {
    typeToFilter(parts.searchInput, value);
    typedIntoInput = true;
    await sleep(250);
    popup = findPopupForAnchor(anchor, parts, before) || popup;
    hit = await findOptionInPopup(popup, value);
  }

  if (!hit) {
    await closeSelect(parts);
    return { ok: false, error: `下拉选项中未找到「${value}」` };
  }

  const chosen = hit;
  clickOption(chosen.el);

  let applied = await waitFor(() => isSelectionApplied(anchor, chosen.text, typedIntoInput), 400, 40);

  // 键盘兜底只用于直接点击未生效的情况；键盘选中可能落到别的选项上，
  // 因此走了键盘就不再采信「弹层已关闭」这个弱信号
  let usedKeyboard = false;
  if (!applied && parts.searchInput) {
    usedKeyboard = true;
    await selectByKeyboard(parts.searchInput, popup, chosen.el);
    applied = await waitFor(() => isSelectionApplied(anchor, chosen.text, typedIntoInput), 400, 40);
  }

  if (!applied && !usedKeyboard) {
    // 点击选项后弹层自动收起，通常意味着选中成功
    const stillOpen = getVisiblePopups().some(
      (p) => p === popup || p.contains(popup) || popup.contains(p)
    );
    if (!stillOpen) applied = true;
  }

  if (!applied) {
    await closeSelect(parts);
    return { ok: false, error: '已点击选项但未生效' };
  }

  return { ok: true, filled: chosen.text };
}

// =================== 自定义日期填充 ===================

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function parseDateParts(raw: string): { year: number; month: number; day: number } | null {
  const m = raw.trim().match(/^(\d{4})\s*[-/.年]?\s*(\d{1,2})?\s*[-/.月]?\s*(\d{1,2})?/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) : 1;
  const day = m[3] ? Number(m[3]) : 1;
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function normalizeDate(raw: string, fmt: 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY'): string | null {
  const parts = parseDateParts(raw);
  if (!parts) return null;
  const { year, month, day } = parts;
  if (fmt === 'YYYY') return String(year);
  if (fmt === 'YYYY-MM') return `${year}-${pad(month)}`;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function inferDateFormat(placeholder: string, inputType: string): 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY' {
  if (inputType === 'month') return 'YYYY-MM';
  if (/YYYY[-/]MM[-/]DD/i.test(placeholder) || /年.*月.*日/.test(placeholder)) return 'YYYY-MM-DD';
  if (/YYYY[-/]MM/i.test(placeholder) || /年.*月/.test(placeholder)) return 'YYYY-MM';
  if (/YYYY|yyyy/.test(placeholder)) return 'YYYY';
  return 'YYYY-MM-DD';
}

async function trySetDateByInput(input: HTMLInputElement, value: string): Promise<boolean> {
  const wasReadonly = input.readOnly;
  const wasDisabled = input.disabled;
  try {
    if (wasReadonly) input.readOnly = false;
    if (wasDisabled) input.disabled = false;

    input.focus({ preventScroll: false });
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, value);
    else input.value = value;

    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    // rc-picker / Element 都靠 Enter 或 blur 提交输入
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', keyCode: 13, which: 13 }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', keyCode: 13, which: 13 }));

    const ok = await waitFor(() => input.value === value && input.value !== '', 300, 40);

    input.dispatchEvent(new Event('blur', { bubbles: true }));
    input.blur();
    return !!ok;
  } finally {
    if (wasReadonly) input.readOnly = true;
    if (wasDisabled) input.disabled = true;
  }
}

function findDatePopup(before: Set<HTMLElement>): HTMLElement | null {
  const fresh = getVisiblePopups().filter((p) => !before.has(p));
  const isPanel = (p: HTMLElement) =>
    p.matches(POPUP_ROOT_SELECTOR) || !!p.querySelector('.ant-picker-cell, .el-date-table, .arco-picker-cell');
  return fresh.find(isPanel) || null;
}

async function navigateMonth(popup: HTMLElement, year: number, month: number): Promise<void> {
  for (let i = 0; i < 48; i++) {
    const head = (popup.querySelector(
      '.ant-picker-header-view, .el-date-picker__header-label, .arco-picker-header-value'
    )?.textContent || '').trim();
    const m = head.match(/(\d{4})\D+(\d{1,2})/);
    // 面板标题里没有月份（年/月面板）时无法判断当前月份，不再翻页
    if (!m) return;
    if (Number(m[1]) === year && Number(m[2]) === month) return;

    const goPrev = Number(m[1]) * 12 + Number(m[2]) > year * 12 + month;
    const sel = goPrev
      ? '.ant-picker-header-prev-btn, .el-picker-panel__icon-btn.arrow-left, .el-date-picker__prev-btn, .arco-picker-header-prev-btn'
      : '.ant-picker-header-next-btn, .el-picker-panel__icon-btn.arrow-right, .el-date-picker__next-btn, .arco-picker-header-next-btn';
    const btn = popup.querySelector<HTMLElement>(sel);
    if (!btn) return;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await sleep(60);
  }
}

function confirmPanel(popup: HTMLElement): void {
  const ok = popup.querySelector<HTMLElement>(
    '.el-picker-panel__footer .el-button--primary, .ant-picker-ok button, .arco-picker-footer-btn-primary'
  );
  if (ok) ok.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
}

async function fillDateByPanel(anchor: HTMLElement, input: HTMLInputElement, raw: string): Promise<boolean> {
  const parsed = parseDateParts(raw);
  if (!parsed) return false;
  const before = input.value;

  await closeAllPopups();
  const popupsBefore = new Set(getVisiblePopups());
  openSelect(anchor, { searchInput: input, clickTarget: input });
  const popup = await waitFor(() => findDatePopup(popupsBefore), 900, 50);
  if (!popup) return false;

  const applied = async (): Promise<boolean> =>
    !!(await waitFor(() => input.value !== before && input.value !== '', 400, 50));

  // 从面板单元格的 title 判断精度（antd / Arco），Element 则靠表格结构判断
  const titles = Array.from(popup.querySelectorAll<HTMLElement>('[title]'))
    .map((el) => el.getAttribute('title') || '');
  const hasDayPrecision = titles.some((t) => /^\d{4}-\d{2}-\d{2}$/.test(t));
  const hasMonthPrecision = titles.some((t) => /^\d{4}-\d{2}$/.test(t));
  const isElementTable = !!popup.querySelector('.el-date-table td, .arco-picker-cell');

  // 1) 日精度
  if (hasDayPrecision || isElementTable) {
    await navigateMonth(popup, parsed.year, parsed.month);
    const full = `${parsed.year}-${pad(parsed.month)}-${pad(parsed.day)}`;
    let cell = popup.querySelector<HTMLElement>(`[title="${full}"]`);
    if (!cell) {
      cell = Array.from(popup.querySelectorAll<HTMLElement>('.el-date-table td.available'))
        .find((td) => (td.textContent || '').trim() === String(parsed.day)
          && !td.classList.contains('prev-month')
          && !td.classList.contains('next-month')) || null;
    }
    if (cell) {
      clickOption(cell);
      confirmPanel(popup);
      if (await applied()) return true;
    }
  }

  // 2) 月精度
  if (hasMonthPrecision || !hasDayPrecision) {
    const monthTitle = `${parsed.year}-${pad(parsed.month)}`;
    let monthCell = popup.querySelector<HTMLElement>(`[title="${monthTitle}"]`);
    if (!monthCell) {
      const yearBtn = popup.querySelector<HTMLElement>(
        '.ant-picker-year-btn, .ant-picker-header-year-btn, .arco-picker-header-year-btn'
      );
      if (yearBtn) {
        yearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        await sleep(150);
        monthCell = popup.querySelector<HTMLElement>(`[title="${monthTitle}"]`);
      }
    }
    if (monthCell) {
      clickOption(monthCell);
      confirmPanel(popup);
      if (await applied()) return true;
    }
  }

  // 3) 年精度
  const yearCell = popup.querySelector<HTMLElement>(`[title="${String(parsed.year)}"]`);
  if (yearCell) {
    clickOption(yearCell);
    confirmPanel(popup);
    if (await applied()) return true;
  }

  await closeSelect({ searchInput: input, clickTarget: input });
  return false;
}

async function fillCustomDate(anchor: HTMLElement, raw: string): Promise<FillOutcome> {
  const input = findInnerInput(anchor);
  if (!input) return { ok: false, error: '未找到日期输入框' };

  const fmt = inferDateFormat(input.getAttribute('placeholder') || '', input.type);
  const value = normalizeDate(raw, fmt);
  if (!value) return { ok: false, error: `无法解析日期「${raw}」` };

  if (await trySetDateByInput(input, value)) return { ok: true, filled: value };
  if (await fillDateByPanel(anchor, input, raw)) return { ok: true, filled: input.value || value };

  return { ok: false, error: `日期选择器未能设置「${raw}」` };
}

// =================== 单选 / 复选 ===================

function getControlWrapper(input: HTMLInputElement): HTMLElement {
  return (input.closest(
    'label, .ant-radio-wrapper, .el-radio, .arco-radio, .ant-checkbox-wrapper, .el-checkbox, .arco-checkbox'
  ) as HTMLElement) || input.parentElement || input;
}

/**
 * 兜底勾选：派发 click 会翻转 checked 并同时触发 React/Vue 的 onChange，
 * 因此只在当前状态与目标不一致时点击一次，避免「先设值再点击」被翻回去
 */
async function setNativeChecked(input: HTMLInputElement, want: boolean): Promise<boolean> {
  if (input.checked === want) return true;

  input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  if (await waitFor(() => input.checked === want, 200, 30)) return true;

  // click 未生效（如被 preventDefault）时直接改属性再补 change
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
  if (setter) setter.call(input, want);
  else input.checked = want;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return !!input.checked === want;
}

async function fillRadioGroup(anchor: HTMLElement, value: string): Promise<FillOutcome> {
  const radios = getGroupControls(anchor, 'radio');
  if (!radios.length) return { ok: false, error: '未找到单选项' };

  let best: HTMLInputElement | null = null;
  let bestScore = 0;
  let bestLabel = '';
  for (const radio of radios) {
    const label = getControlLabel(radio);
    const score = Math.max(bestMatchScore(value, label), scoreOptionText(value, radio.value));
    if (score > bestScore) {
      bestScore = score;
      best = radio;
      bestLabel = label;
    }
  }
  if (!best || bestScore < MATCH_THRESHOLD) return { ok: false, error: `单选组中未找到「${value}」` };

  const chosen = best;
  dispatchMouseSequence(getControlWrapper(chosen));
  let ok: boolean | null = await waitFor(() => chosen.checked, 250, 30);
  if (!ok) ok = await setNativeChecked(chosen, true);
  return ok ? { ok: true, filled: bestLabel || value } : { ok: false, error: '单选未生效' };
}

const TRUTHY = ['true', '1', '是', 'yes', 'y', '接受', '同意', '可以', '有'];
const FALSY = ['false', '0', '否', 'no', 'n', '不接受', '不同意', '不可以', '无'];

function toBoolean(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (TRUTHY.includes(v)) return true;
  if (FALSY.includes(v)) return false;
  return null;
}

async function fillCheckbox(anchor: HTMLElement, value: string): Promise<FillOutcome> {
  const input = anchor.tagName === 'INPUT'
    ? (anchor as HTMLInputElement)
    : anchor.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!input) return { ok: false, error: '未找到复选框' };

  const want = toBoolean(value) ?? true;
  if (input.checked !== want) {
    dispatchMouseSequence(getControlWrapper(input));
    if (!(await waitFor(() => input.checked === want, 200, 30))) {
      if (!(await setNativeChecked(input, want))) {
        return { ok: false, error: '复选框未生效' };
      }
    }
  }
  return { ok: true, filled: want ? '是' : '否' };
}

async function fillCheckboxGroup(anchor: HTMLElement, value: string): Promise<FillOutcome> {
  const boxes = getGroupControls(anchor, 'checkbox');
  if (!boxes.length) return { ok: false, error: '未找到复选项' };

  const tokens = value.split(/[、,，;；/|]/).map((s) => s.trim()).filter(Boolean);
  const filled: string[] = [];

  for (const token of tokens) {
    let best: HTMLInputElement | null = null;
    let bestScore = 0;
    let bestLabel = '';
    for (const box of boxes) {
      const label = getControlLabel(box);
      const score = Math.max(bestMatchScore(token, label), scoreOptionText(token, box.value));
      if (score > bestScore) {
        bestScore = score;
        best = box;
        bestLabel = label;
      }
    }
    if (!best || bestScore < MATCH_THRESHOLD) continue;

    const chosen = best;
    if (!chosen.checked) {
      dispatchMouseSequence(getControlWrapper(chosen));
      if (!(await waitFor(() => chosen.checked, 200, 30))) {
        if (!(await setNativeChecked(chosen, true))) continue; // 未勾上就不算已填
      }
    }
    filled.push(bestLabel || token);
  }

  if (!filled.length) return { ok: false, error: `复选组中未找到「${value}」` };
  return { ok: true, filled: filled.join('、') };
}

// =================== 原生控件填充 ===================

/** 填充文本输入（模拟真人输入，兼容 React/Vue） */
function fillTextInput(input: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;
  const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  input.focus();
  input.dispatchEvent(new Event('focus', { bubbles: true }));

  // 使用 native setter 绕过 React 的受控组件机制
  if (input.tagName === 'TEXTAREA' && nativeTextareaValueSetter) {
    nativeTextareaValueSetter.call(input, value);
  } else if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value);
  } else {
    input.value = value;
  }

  // 触发完整的事件链
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  // React 17+ 使用 InputEvent
  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));

  return input.value === value;
}

/** 填充原生下拉选择框 */
function fillSelect(select: HTMLSelectElement, value: string): boolean {
  let best: HTMLOptionElement | null = null;
  let bestScore = 0;
  for (const opt of Array.from(select.options)) {
    const text = opt.text.trim();
    if (!text) continue;
    const score = Math.max(bestMatchScore(value, text), scoreOptionText(value, opt.value));
    if (score > bestScore) {
      bestScore = score;
      best = opt;
    }
  }
  if (!best || bestScore < MATCH_THRESHOLD) return false;

  select.value = best.value;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function fillContentEditable(el: HTMLElement, value: string): FillOutcome {
  el.focus();
  el.textContent = '';
  const lines = value.split('\n');
  lines.forEach((line, index) => {
    if (index > 0) el.appendChild(document.createElement('br'));
    el.appendChild(document.createTextNode(line));
  });
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, filled: value };
}

// =================== 核心功能：扫描表单字段 ===================

function scanFormFields(): FormField[] {
  const ats = detectCurrentATS();
  const fields: FormField[] = [];
  const processedAnchors = new Set<HTMLElement>();

  if (ats) {
    console.log(`[CampusApply] 检测到 ATS 系统：${ats.name}`);
  }

  // 通用选择器 + ATS 专用选择器 + 自定义组件容器
  const defaultSelector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea, [contenteditable="true"]';
  const selector = ats?.formSelector || defaultSelector;

  const nodes = [
    ...Array.from(document.querySelectorAll<HTMLElement>(selector)),
    ...Array.from(document.querySelectorAll<HTMLElement>(CUSTOM_WIDGET_SELECTOR)),
  ];

  nodes.forEach((el) => {
    if (el.closest(EXCLUDE_REGION)) return;

    const kind = detectWidgetKind(el);
    const anchor = resolveAnchor(el, kind);
    if (!anchor) return;
    if (processedAnchors.has(anchor)) return;

    // 原生类型必须落到真正的表单控件上，容器型元素（如包着 date input 的 div）跳过
    if (NATIVE_KINDS.has(kind) && !isNativeControl(anchor)) return;

    // 自定义组件与单选/复选看容器可见性，原生控件看自身
    const relaxed = !NATIVE_KINDS.has(kind);
    if (relaxed ? !isWidgetAnchorVisible(anchor) : !isVisible(anchor)) return;

    const inputType = ((el as HTMLInputElement).type || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image', 'file', 'password'].includes(inputType)) return;

    const name = (el.getAttribute('name') || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const classList = typeof el.className === 'string' ? el.className.toLowerCase() : '';
    // 下拉组件内部搜索框的类名含 search，需放行
    if (kind !== 'custom-select'
      && (name.includes('search') || id.includes('search') || classList.includes('search'))) return;
    if (name.includes('captcha') || id.includes('captcha') || name.includes('verify')) return;

    const finalKind = refineKind(anchor, kind);
    const finalAnchor = finalKind === kind ? anchor : resolveAnchor(el, finalKind);
    if (processedAnchors.has(finalAnchor)) return;

    const label = findLabelForWidget(finalAnchor, ats);
    const placeholder = findInnerInput(finalAnchor)?.getAttribute('placeholder')
      || finalAnchor.getAttribute('placeholder')
      || undefined;

    const field: FormField = {
      id: genId(),
      elementId: finalAnchor.id || undefined,
      elementName: finalAnchor.getAttribute('name') || el.getAttribute('name') || undefined,
      tagName: (finalKind === 'custom-select' || finalKind === 'native-select') ? 'select'
        : finalKind === 'textarea' ? 'textarea'
        : finalKind === 'contenteditable' ? 'div'
        : 'input',
      inputType: finalKind === 'radio-group' ? 'radio'
        : (finalKind === 'checkbox' || finalKind === 'checkbox-group') ? 'checkbox'
        : (finalKind === 'custom-date' || finalKind === 'native-date') ? 'date'
        : ((finalAnchor as HTMLInputElement).type || undefined),
      label,
      placeholder,
      required: isRequiredWidget(finalAnchor),
      maxLength: (finalAnchor as HTMLInputElement).maxLength > 0
        ? (finalAnchor as HTMLInputElement).maxLength
        : undefined,
      pattern: finalAnchor.getAttribute('pattern') || undefined,
      xpath: getXPath(finalAnchor),
      cssSelector: getCssSelector(finalAnchor),
      sectionContext: getSectionContext(finalAnchor),
      value: readCurrentValue(finalAnchor, finalKind),
      widgetKind: finalKind,
      groupName: (finalKind === 'radio-group' || finalKind === 'checkbox-group')
        ? (finalAnchor.getAttribute('name') || undefined)
        : undefined,
      anchorSelector: getCssSelector(finalAnchor),
    };

    if (finalKind === 'native-select') {
      field.options = getSelectOptions(finalAnchor as HTMLSelectElement);
    } else if (finalKind === 'radio-group') {
      field.options = getGroupControls(finalAnchor, 'radio').map((c) => getControlLabel(c)).filter(Boolean);
    } else if (finalKind === 'checkbox-group') {
      field.options = getGroupControls(finalAnchor, 'checkbox').map((c) => getControlLabel(c)).filter(Boolean);
    } else if (finalKind === 'custom-select') {
      field.options = []; // 选项需要展开后才能拿到
    }

    // 锚点打标：用不会被框架重建的容器承载元数据
    finalAnchor.setAttribute('data-ca-field-id', field.id);
    finalAnchor.setAttribute('data-ca-widget', finalKind);
    finalAnchor.setAttribute('data-ca-label', label);

    fields.push(field);
    processedAnchors.add(anchor);
    processedAnchors.add(finalAnchor);
  });

  return fields;
}

// =================== 核心功能：增强版填充 ===================

interface FillOutcome {
  ok: boolean;
  filled?: string;
  error?: string;
}

async function fillByKind(anchor: HTMLElement, kind: WidgetKind, value: string): Promise<FillOutcome> {
  switch (kind) {
    case 'custom-select':
      return fillCustomSelect(anchor, value);
    case 'custom-date':
      return fillCustomDate(anchor, value);
    case 'radio-group':
      return fillRadioGroup(anchor, value);
    case 'checkbox-group':
      return fillCheckboxGroup(anchor, value);
    case 'checkbox':
      return fillCheckbox(anchor, value);
    case 'native-select':
      return fillSelect(anchor as HTMLSelectElement, value)
        ? { ok: true, filled: value }
        : { ok: false, error: `下拉选项中未找到「${value}」` };
    case 'contenteditable':
      return fillContentEditable(anchor, value);
    default: {
      if (anchor.tagName === 'SELECT') {
        return fillSelect(anchor as HTMLSelectElement, value)
          ? { ok: true, filled: value }
          : { ok: false, error: `下拉选项中未找到「${value}」` };
      }
      if (anchor.tagName === 'TEXTAREA' || anchor.tagName === 'INPUT') {
        return fillTextInput(anchor as HTMLInputElement, value)
          ? { ok: true, filled: value }
          : { ok: false, error: '输入框未能写入内容' };
      }
      if (anchor.isContentEditable) return fillContentEditable(anchor, value);
      return { ok: false, error: '不支持的字段类型' };
    }
  }
}

async function executeFill(
  fieldsToFill: { fieldId: string; value: string; type?: string }[]
): Promise<FillFieldResult[]> {
  const ats = detectCurrentATS();
  const results: FillFieldResult[] = [];

  for (const { fieldId, value, type } of fieldsToFill) {
    const anchor = document.querySelector<HTMLElement>(`[data-ca-field-id="${fieldId}"]`);

    if (!anchor) {
      results.push({
        fieldId,
        label: '未找到元素',
        type: (type as FillFieldResult['type']) || 'unknown',
        status: 'failed',
        errorMessage: '页面元素未找到，可能已重新加载',
        confidence: 0,
      });
      continue;
    }

    const label = anchor.getAttribute('data-ca-label') || findLabel(anchor, ats);
    const kind = (anchor.getAttribute('data-ca-widget') as WidgetKind | null) || inferKindFromDom(anchor);

    let outcome: FillOutcome;
    try {
      outcome = await fillByKind(anchor, kind, value);
    } catch (error) {
      outcome = { ok: false, error: error instanceof Error ? error.message : '填充失败' };
    }

    if (outcome.ok) applySuccessHighlight(anchor);
    else applyErrorHighlight(anchor);

    results.push({
      fieldId,
      label,
      type: (type as FillFieldResult['type']) || kindToResultType(kind),
      status: outcome.ok ? 'success' : 'failed',
      filledValue: outcome.ok ? (outcome.filled ?? value) : undefined,
      confidence: outcome.ok ? 1 : 0,
      errorMessage: outcome.ok ? undefined : outcome.error,
    });

    await sleep(120); // 让页面框架状态落定
  }

  return results;
}

// =================== 高亮效果 ===================

/** 注入高亮 CSS（首次调用时执行） */
let highlightCSSInjected = false;
function injectHighlightCSS(): void {
  if (highlightCSSInjected) return;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes ca-fill-success {
      0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
      50% { box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.3); }
      100% { box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2); }
    }
    @keyframes ca-fill-error {
      0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
      50% { box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.3); }
      100% { box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2); }
    }
    [data-ca-filled="success"] {
      outline: 2px solid #22c55e !important;
      outline-offset: 2px !important;
      animation: ca-fill-success 0.6s ease forwards !important;
    }
    [data-ca-filled="error"] {
      outline: 2px solid #ef4444 !important;
      outline-offset: 2px !important;
      animation: ca-fill-error 0.6s ease forwards !important;
    }
    [data-ca-filled="pending"] {
      outline: 2px solid #f59e0b !important;
      outline-offset: 2px !important;
    }
  `;
  document.head.appendChild(style);
  highlightCSSInjected = true;
}

function applySuccessHighlight(element: HTMLElement): void {
  injectHighlightCSS();
  element.setAttribute('data-ca-filled', 'success');
}

function applyErrorHighlight(element: HTMLElement): void {
  injectHighlightCSS();
  element.setAttribute('data-ca-filled', 'error');
}

// =================== 清空填充 ===================

function clearAllFilled(): void {
  const filledElements = document.querySelectorAll<HTMLElement>('[data-ca-filled]');
  filledElements.forEach((el) => {
    el.removeAttribute('data-ca-filled');
    el.style.outline = '';
    el.style.outlineOffset = '';
    el.style.boxShadow = '';

    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
        'value'
      )?.set;
      if (nativeSetter) nativeSetter.call(el, '');
      else (el as HTMLInputElement).value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.tagName === 'SELECT') {
      (el as HTMLSelectElement).selectedIndex = 0;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const widget = el.getAttribute('data-ca-widget');
      if (widget === 'custom-select') {
        // 自定义下拉：点组件的清除按钮
        const clearBtn = el.querySelector<HTMLElement>(
          '.ant-select-clear, .el-select__clear, .arco-select-clear'
        );
        if (clearBtn) dispatchMouseSequence(clearBtn);
      } else if (widget === 'radio-group' || widget === 'checkbox-group') {
        // 单选/复选组：逐个取消勾选
        el.querySelectorAll<HTMLInputElement>('input:checked').forEach((input) => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
          if (setter) setter.call(input, false);
          else input.checked = false;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
      } else {
        // 容器型日期组件：清空内部文本框
        el.querySelectorAll<HTMLInputElement>('input:not([type="radio"]):not([type="checkbox"])')
          .forEach((input) => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            if (setter) setter.call(input, '');
            else input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          });
      }
    }
  });

  // 移除所有锚点元数据
  document.querySelectorAll('[data-ca-field-id]').forEach((el) => {
    el.removeAttribute('data-ca-field-id');
    el.removeAttribute('data-ca-widget');
    el.removeAttribute('data-ca-label');
  });
}

// =================== 消息监听 ===================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'SCAN_FORM_FIELDS': {
      const ats = detectCurrentATS();
      const atsName = ats?.name || '通用页面';
      const fields = scanFormFields();
      console.log(`[CampusApply] [${atsName}] 扫描到 ${fields.length} 个表单字段`);
      sendResponse({ success: true, fields, atsName });
      break;
    }

    case 'EXECUTE_FILL': {
      executeFill(message.data)
        .then((results) => {
          const success = results.filter((r) => r.status === 'success').length;
          console.log(`[CampusApply] 填充完成：${success}/${results.length} 成功`);
          sendResponse({ success: true, results });
        })
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : '填充执行失败',
          });
        });
      return true; // 异步响应：保持消息通道打开
    }

    case 'CLEAR_ALL_FILLED': {
      clearAllFilled();
      console.log('[CampusApply] 已清空所有填充内容');
      sendResponse({ success: true });
      break;
    }

    case 'FILL_SINGLE_FIELD': {
      sendResponse({ success: false, message: '单字段填充功能开发中' });
      break;
    }

    case 'FILL_ALL_FIELDS': {
      chrome.runtime.sendMessage({ type: 'TRIGGER_FILL_FROM_CONTEXT_MENU' });
      sendResponse({ success: true });
      break;
    }

    case 'DETECT_ATS': {
      const detectedAts = detectCurrentATS();
      sendResponse({ success: true, ats: detectedAts });
      break;
    }

    default:
      break;
  }
  return false;
});

// 初始化
console.log('[CampusApply Agent] 内容脚本已加载 v3');
const initialATS = detectCurrentATS();
if (initialATS) {
  console.log(`[CampusApply] 检测到 ATS 系统：${initialATS.name}`);
}
