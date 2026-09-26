# 🎓 CampusApply Agent - 校招网申智能体

> AI 驱动的校招网申表单自动填充 Chrome 插件 — 一键智能填写，告别重复劳动

## ✨ 核心功能

| 功能 | 说明 |
|------|------|
| ⚡ **一键智能填充** | 打开网申页面 → 点击「一键填充」→ 自动匹配所有表单字段 |
| 🤖 **三级匹配引擎** | 规则快速匹配 → 语义模糊匹配 → LLM 兜底（支持 5 家模型厂商） |
| 📄 **简历智能解析** | 上传 PDF/TXT/MD 简历 → AI 自动提取结构化信息 |
| 💬 **开放性问题回答** | 输入校招常见问题 → AI 基于个人信息生成个性化回答 |
| 🏢 **ATS 系统适配** | 适配北森/Moka/智联/牛客/前程无忧/Greenhouse 6 大平台 |
| 🌙 **暗色模式** | 随系统自动切换亮/暗主题 |
| 💾 **数据本地存储** | 所有数据只存浏览器本地，不上传任何服务器 |
| 🔄 **备份恢复** | JSON 格式一键导出/导入全部个人信息 |

## 🛠 技术栈

- **框架**: Vite 6 + React 19 + TypeScript 5
- **扩展**: Chrome Manifest V3
- **存储**: IndexedDB（via idb-keyval 风格封装）
- **AI**: OpenAI / Claude / 通义千问 / 豆包 / Ollama

## 🚀 安装使用

### 开发模式

```bash
cd extension
npm install
npm run build
```

### 加载到 Chrome

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `extension/dist` 目录

### 使用流程

1. **填写信息**：点击插件图标 → 打开管理页面 → 填写个人信息/教育经历/实习经历
2. **配置 AI**（可选）：在 AI 模型配置页面添加 API Key
3. **上传简历**（可选）：在简历解析页面上传 PDF 简历，AI 自动提取
4. **开始填充**：打开网申页面 → 点击侧边栏「⚡ 一键智能填充」

## 📁 项目结构

```
extension/src/
├── types/models.ts              # 20+ 数据接口
├── storage/db.ts                # IndexedDB 存储（CRUD + 备份恢复）
├── engine/
│   ├── fieldMappingRules.ts     # 40+ 规则 / 200+ 关键词
│   ├── matchingEngine.ts        # 规则 + 语义两级匹配
│   ├── llmService.ts            # 5 家 AI 模型 API
│   ├── fillOrchestrator.ts      # 填充全流程编排
│   ├── atsProfiles.ts           # ATS 系统适配
│   └── resumeParser.ts          # 简历解析
├── background/index.ts          # Service Worker
├── content/index.ts             # Content Script V2
├── sidebar/                     # 侧边栏（4 标签页）
├── popup/                       # 弹窗
└── options/                     # 管理中心（6 模块）
```

## 🔒 隐私安全

- ✅ 所有数据**仅存储在本地浏览器** IndexedDB 中
- ✅ API Key 不经过任何中间服务器
- ✅ AI 请求直接发送到厂商官方 API
- ✅ 开源代码，可审计

## 📄 开源协议

MIT License
