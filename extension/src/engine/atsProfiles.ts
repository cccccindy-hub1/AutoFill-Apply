// ============================================================
// 国内 ATS 系统适配规则
// 提供针对北森、Moka 等主流校招 ATS 系统的特殊处理
// ============================================================

export interface ATSProfile {
  /** ATS 系统名称 */
  name: string;
  /** 匹配当前页面的 URL 或 DOM 特征 */
  detection: {
    urlPatterns?: RegExp[];
    domSelectors?: string[];
    domTextPatterns?: RegExp[];
  };
  /** 特殊的表单选择器（覆盖通用扫描） */
  formSelectors?: string;
  /** 字段识别增强规则 */
  fieldEnhancers?: ATSFieldEnhancer[];
  /** 特殊处理函数名 */
  specialHandlers?: string[];
  /** 表单加载等待时间（毫秒） */
  loadDelay?: number;
}

export interface ATSFieldEnhancer {
  /** 匹配条件 */
  selector?: string;
  labelSelector?: string;
  /** 强制覆盖的标签 */
  forceLabel?: string;
  /** 强制覆盖的数据路径 */
  forceDataPath?: string;
}

// =================== 北森 (Beisen/iTalentX) ===================

const BEISEN_PROFILE: ATSProfile = {
  name: '北森 iTalentX',
  detection: {
    urlPatterns: [
      /\.italent\.cn/,
      /\.beisen\.com/,
      /italentx\./,
      /rszhaopin\./,
      /career\.beisen/,
    ],
    domSelectors: [
      '.italent-form',
      '[class*="italent"]',
      '[class*="beisen"]',
      '#app[data-v-]', // Vue SPA 标记
    ],
    domTextPatterns: [
      /北森/,
      /iTalent/,
      /Beisen/,
    ],
  },
  formSelectors: 'input:not([type="hidden"]), select, textarea, [contenteditable="true"], .ant-select, .el-select, .ant-input, .el-input__inner, [class*="form-item"] input, [class*="form-item"] select, [class*="form-item"] textarea',
  fieldEnhancers: [
    {
      // 北森用 ant-design 组件，label 通常在 .ant-form-item-label 中
      labelSelector: '.ant-form-item-label label, .ant-form-item-label .ant-form-item-required',
    },
    {
      // 北森的下拉选择通常用 .ant-select
      selector: '.ant-select .ant-select-selection-search-input',
      labelSelector: '.ant-form-item-label label',
    },
  ],
  specialHandlers: ['handleAntSelect', 'handleAntDatePicker', 'waitForDynamicForm'],
  loadDelay: 2000,
};

// =================== Moka ===================

const MOKA_PROFILE: ATSProfile = {
  name: 'Moka',
  detection: {
    urlPatterns: [
      /\.mokahr\.com/,
      /\.moka\.com/,
      /career\.moka/,
      /app\.mokahr/,
    ],
    domSelectors: [
      '[class*="moka"]',
      '.application-form',
      '.recruit-form',
    ],
    domTextPatterns: [
      /Moka/i,
      /mokahr/i,
    ],
  },
  formSelectors: 'input, select, textarea, .moka-select, .moka-input, [class*="form-control"] input, [class*="form-control"] select',
  fieldEnhancers: [
    {
      labelSelector: '.form-label, .field-label, [class*="label"]',
    },
  ],
  specialHandlers: ['handleMokaSelect', 'waitForDynamicForm'],
  loadDelay: 1500,
};

// =================== 智联招聘校招 ===================

const ZHILIAN_PROFILE: ATSProfile = {
  name: '智联招聘',
  detection: {
    urlPatterns: [
      /\.zhaopin\.com/,
      /xiaoyuan\.zhaopin/,
      /campus\.zhaopin/,
    ],
    domSelectors: [
      '[class*="zhaopin"]',
    ],
  },
  loadDelay: 1000,
};

// =================== 牛客网 ===================

const NOWCODER_PROFILE: ATSProfile = {
  name: '牛客网',
  detection: {
    urlPatterns: [
      /\.nowcoder\.com/,
      /campus\.nowcoder/,
    ],
    domSelectors: [
      '[class*="nowcoder"]',
      '.nc-form',
    ],
  },
  loadDelay: 1000,
};

// =================== 前程无忧校招 ===================

const JOB51_PROFILE: ATSProfile = {
  name: '前程无忧',
  detection: {
    urlPatterns: [
      /\.51job\.com/,
      /campus\.51job/,
    ],
  },
  loadDelay: 1000,
};

// =================== Greenhouse (海外但国内外企常用) ===================

const GREENHOUSE_PROFILE: ATSProfile = {
  name: 'Greenhouse',
  detection: {
    urlPatterns: [
      /boards\.greenhouse\.io/,
      /\.greenhouse\.io/,
    ],
    domSelectors: [
      '#application-form',
      '.garden-form',
    ],
  },
  formSelectors: '#application-form input, #application-form select, #application-form textarea',
  fieldEnhancers: [
    {
      labelSelector: 'label',
    },
  ],
  loadDelay: 500,
};

// =================== 通用 SPA 框架检测 ===================

const GENERIC_SPA_PROFILE: ATSProfile = {
  name: '通用 SPA',
  detection: {
    domSelectors: [
      '#app[data-v-]',   // Vue
      '#root',           // React
      'app-root',        // Angular
      '[ng-app]',        // AngularJS
    ],
  },
  formSelectors: 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea, [contenteditable="true"]',
  specialHandlers: ['waitForDynamicForm'],
  loadDelay: 1500,
};

// =================== 导出所有 ATS 配置 ===================

export const ATS_PROFILES: ATSProfile[] = [
  BEISEN_PROFILE,
  MOKA_PROFILE,
  ZHILIAN_PROFILE,
  NOWCODER_PROFILE,
  JOB51_PROFILE,
  GREENHOUSE_PROFILE,
  GENERIC_SPA_PROFILE,
];

/**
 * 检测当前页面匹配的 ATS 系统
 */
export function detectATS(url: string, document: Document): ATSProfile | null {
  for (const profile of ATS_PROFILES) {
    const { detection } = profile;

    // URL 匹配
    if (detection.urlPatterns) {
      if (detection.urlPatterns.some((p) => p.test(url))) {
        return profile;
      }
    }

    // DOM 选择器匹配
    if (detection.domSelectors) {
      if (detection.domSelectors.some((s) => document.querySelector(s))) {
        return profile;
      }
    }

    // DOM 文本匹配
    if (detection.domTextPatterns) {
      const bodyText = document.body?.innerText?.substring(0, 5000) || '';
      if (detection.domTextPatterns.some((p) => p.test(bodyText))) {
        return profile;
      }
    }
  }

  return null;
}

/**
 * 获取 ATS 的表单选择器
 */
export function getATSFormSelector(profile: ATSProfile | null): string {
  return profile?.formSelectors || 
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea, [contenteditable="true"]';
}

/**
 * 获取 ATS 特定的 label 选择器
 */
export function getATSLabelSelector(profile: ATSProfile | null, element: HTMLElement): string | null {
  if (!profile?.fieldEnhancers) return null;

  for (const enhancer of profile.fieldEnhancers) {
    if (enhancer.labelSelector) {
      // 在元素的父级中查找 label
      const formItem = element.closest('.ant-form-item, .el-form-item, .form-group, .form-item, [class*="form-item"], [class*="field"]');
      if (formItem) {
        const label = formItem.querySelector(enhancer.labelSelector);
        if (label?.textContent?.trim()) {
          return label.textContent.trim();
        }
      }
    }
  }

  return null;
}
