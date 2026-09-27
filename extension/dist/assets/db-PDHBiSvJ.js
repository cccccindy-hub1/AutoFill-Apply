import{A as x}from"./version-Dhlx-etI.js";const k=[{id:"openai",label:"OpenAI",defaultModel:"gpt-4o-mini",defaultBaseUrl:"https://api.openai.com/v1"},{id:"claude",label:"Anthropic Claude",defaultModel:"claude-3-5-sonnet-20241022",defaultBaseUrl:"https://api.anthropic.com/v1"},{id:"deepseek",label:"DeepSeek 深度求索",defaultModel:"deepseek-chat",defaultBaseUrl:"https://api.deepseek.com/v1"},{id:"minimax",label:"MiniMax",defaultModel:"MiniMax-Text-01",defaultBaseUrl:"https://api.minimax.chat/v1"},{id:"zhipu",label:"智谱 GLM",defaultModel:"glm-4-flash",defaultBaseUrl:"https://open.bigmodel.cn/api/paas/v4"},{id:"moonshot",label:"月之暗面 Kimi",defaultModel:"moonshot-v1-8k",defaultBaseUrl:"https://api.moonshot.cn/v1"},{id:"qianwen",label:"阿里通义千问",defaultModel:"qwen-turbo",defaultBaseUrl:"https://dashscope.aliyuncs.com/compatible-mode/v1"},{id:"doubao",label:"字节跳动豆包",defaultModel:"doubao-pro-4k",defaultBaseUrl:"https://ark.cn-beijing.volces.com/api/v3"},{id:"baichuan",label:"百川智能",defaultModel:"Baichuan4",defaultBaseUrl:"https://api.baichuan-ai.com/v1"},{id:"ollama",label:"Ollama（本地）",defaultModel:"llama3",defaultBaseUrl:"http://localhost:11434/v1"},{id:"custom",label:"自定义（兼容 OpenAI 格式）",defaultModel:"",defaultBaseUrl:"https://api.openai.com/v1"}];function B(e){return k.find(a=>a.id===e)}const w=3e4,j=new Set([408,425,429,500,502,503,504]),C=2,U="https://api.openai.com/v1";function _(e){var a;return e.baseUrl?e.baseUrl.replace(/\/$/,""):((a=B(e.provider))==null?void 0:a.defaultBaseUrl)||U}async function L(e,a){let r;for(let s=0;s<C;s++){const o=new AbortController,n=setTimeout(()=>o.abort(),w);try{const l=await fetch(e,{...a,signal:o.signal});if(j.has(l.status)&&s<C-1){r=new Error(`HTTP ${l.status}`),await R(500*2**s);continue}return l}catch(l){if(r=l,s<C-1){await R(500*2**s);continue}throw l instanceof DOMException&&l.name==="AbortError"?new Error(`请求超时（${w/1e3} 秒），请检查网络或降低模型负载`):l}finally{clearTimeout(n)}}throw r instanceof Error?r:new Error("请求失败")}function R(e){return new Promise(a=>setTimeout(a,e))}async function M(e,a){var n,l,i;const r=_(e);if(e.provider==="claude")return Y(e,a);const s=await L(`${r}/chat/completions`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${e.apiKey||""}`},body:JSON.stringify({model:e.model,messages:a.messages,temperature:a.temperature??.3,max_tokens:a.maxTokens??1e3})});if(!s.ok){const m=await s.text();throw new Error(`LLM API 调用失败 (${s.status}): ${m}`)}const o=await s.json();return{content:((i=(l=(n=o.choices)==null?void 0:n[0])==null?void 0:l.message)==null?void 0:i.content)||"",usage:o.usage?{promptTokens:o.usage.prompt_tokens,completionTokens:o.usage.completion_tokens}:void 0}}async function Y(e,a){var i,m,c;const r=_(e),s=(i=a.messages.find(d=>d.role==="system"))==null?void 0:i.content,o=a.messages.filter(d=>d.role!=="system"),n=await L(`${r}/messages`,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":e.apiKey||"","anthropic-version":"2023-06-01"},body:JSON.stringify({model:e.model,max_tokens:a.maxTokens??1e3,system:s,messages:o.map(d=>({role:d.role,content:d.content}))})});if(!n.ok){const d=await n.text();throw new Error(`Claude API 调用失败 (${n.status}): ${d}`)}const l=await n.json();return{content:((c=(m=l.content)==null?void 0:m[0])==null?void 0:c.text)||"",usage:l.usage?{promptTokens:l.usage.input_tokens,completionTokens:l.usage.output_tokens}:void 0}}async function H(e,a,r,s){const o=`你是一个校招网申表单智能填充助手。
  
用户的个人信息如下：
${s}

当前需要填写的表单字段是：
- 字段标签：${a}
- 字段上下文：${r}

请根据用户的个人信息，给出这个字段最合适的填写内容。
注意：
1. 只返回填写的内容本身，不要有任何解释
2. 如果用户信息中没有对应的内容，返回空字符串
3. 确保内容格式正确（如日期、电话号码等）
4. 内容应简洁明了，符合求职场景`;try{const l=(await M(e,{messages:[{role:"system",content:"你是校招网申智能填充助手，只返回表单字段的填写内容。"},{role:"user",content:o}],temperature:.1,maxTokens:500})).content.trim();return{value:l,confidence:l?.7:0}}catch(n){return console.error("[CampusApply] LLM 匹配失败:",n),{value:"",confidence:0}}}async function J(e,a,r,s){const o=`你是一个资深的校招求职辅导专家。

用户的个人信息和经历：
${r}



请帮用户回答以下网申开放性问题：
"${a}"

要求：
1. 回答要个性化，基于用户的真实经历，避免通用模板化内容
2. 400字以内，结构清晰
3. 突出与岗位的匹配度
4. 语气真诚、自信、专业
5. 直接给出答案文本，不要加引号或额外说明`;try{return(await M(e,{messages:[{role:"system",content:"你是校招求职辅导专家，帮助应届生撰写个性化的网申回答。"},{role:"user",content:o}],temperature:.6,maxTokens:1e3})).content.trim()}catch(n){throw console.error("[CampusApply] LLM 生成失败:",n),n}}async function X(e,a){const r=`请将以下简历文本解析为 JSON 结构化数据。

简历文本：
${a.substring(0,5e3)}

请按以下 JSON 格式输出（只输出 JSON，不要有其他文字）：
{
  "name": "姓名",
  "gender": "男/女",
  "phone": "手机号",
  "email": "邮箱",
  "birthDate": "YYYY-MM-DD",
  "nativePlace": "籍贯",
  "politicalStatus": "政治面貌",
  "educations": [
    {
      "type": "本科/硕士/博士",
      "school": "学校名称",
      "college": "学院",
      "major": "专业",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM",
      "gpa": "绩点",
      "ranking": "排名"
    }
  ],
  "experiences": [
    {
      "type": "实习/项目/科研/校园",
      "organization": "公司/组织",
      "role": "岗位",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM",
      "description": "描述",
      "bullets": ["要点1", "要点2"]
    }
  ],
  "skills": ["技能1", "技能2"]
}

注意：
1. 只输出合法的 JSON，不要有任何前缀后缀
2. 无法提取的字段留空字符串
3. 日期统一为 YYYY-MM 格式`;try{let o=(await M(e,{messages:[{role:"system",content:"你是简历解析专家，将简历文本转换为结构化 JSON 数据。只输出 JSON。"},{role:"user",content:r}],temperature:.1,maxTokens:2e3})).content.trim();return o=o.replace(/^```(?:json)?\s*/,"").replace(/\s*```$/,""),JSON.parse(o)}catch(s){throw console.error("[CampusApply] 简历解析失败:",s),s}}const $="CampusApplyAgent",F=1,t={PERSONAL_INFO:"personalInfo",EDUCATIONS:"educations",EXPERIENCES:"experiences",SKILLS:"skills",ATTACHMENTS:"attachments",QA_MATERIALS:"qaMaterials",AI_CONFIGS:"aiConfigs",APPLICATION_RECORDS:"applicationRecords"};let p=null;function E(){return p||(p=new Promise((e,a)=>{const r=indexedDB.open($,F);r.onupgradeneeded=s=>{const o=s.target.result;if(o.objectStoreNames.contains(t.PERSONAL_INFO)||o.createObjectStore(t.PERSONAL_INFO,{keyPath:"id"}),!o.objectStoreNames.contains(t.EDUCATIONS)){const n=o.createObjectStore(t.EDUCATIONS,{keyPath:"id"});n.createIndex("type","type",{unique:!1}),n.createIndex("order","order",{unique:!1})}if(!o.objectStoreNames.contains(t.EXPERIENCES)){const n=o.createObjectStore(t.EXPERIENCES,{keyPath:"id"});n.createIndex("type","type",{unique:!1}),n.createIndex("order","order",{unique:!1})}if(o.objectStoreNames.contains(t.SKILLS)||o.createObjectStore(t.SKILLS,{keyPath:"id"}),o.objectStoreNames.contains(t.ATTACHMENTS)||o.createObjectStore(t.ATTACHMENTS,{keyPath:"id"}).createIndex("type","type",{unique:!1}),o.objectStoreNames.contains(t.QA_MATERIALS)||o.createObjectStore(t.QA_MATERIALS,{keyPath:"id"}).createIndex("category","category",{unique:!1}),o.objectStoreNames.contains(t.AI_CONFIGS)||o.createObjectStore(t.AI_CONFIGS,{keyPath:"id"}),!o.objectStoreNames.contains(t.APPLICATION_RECORDS)){const n=o.createObjectStore(t.APPLICATION_RECORDS,{keyPath:"id"});n.createIndex("status","status",{unique:!1}),n.createIndex("appliedAt","appliedAt",{unique:!1})}},r.onsuccess=()=>{const s=r.result;s.onversionchange=()=>{s.close(),p=null},e(s)},r.onerror=()=>{p=null,a(r.error)},r.onblocked=()=>{p=null,a(new Error("数据库被其他页面占用，请关闭其他标签页后重试"))}}),p.catch(()=>{p=null}),p)}function D(){return`${Date.now()}_${Math.random().toString(36).substring(2,9)}`}async function u(e){const a=await E();return new Promise((r,s)=>{const l=a.transaction(e,"readonly").objectStore(e).getAll();l.onsuccess=()=>r(l.result),l.onerror=()=>s(l.error)})}async function P(e,a){const r=await E();return new Promise((s,o)=>{const i=r.transaction(e,"readonly").objectStore(e).get(a);i.onsuccess=()=>s(i.result),i.onerror=()=>o(i.error)})}async function A(e,a){const r=await E();return new Promise((s,o)=>{const n=r.transaction(e,"readwrite");n.objectStore(e).put(a),n.oncomplete=()=>s(),n.onerror=()=>o(n.error)})}async function I(e,a){const r=await E();return new Promise((s,o)=>{const n=r.transaction(e,"readwrite");n.objectStore(e).delete(a),n.oncomplete=()=>s(),n.onerror=()=>o(n.error)})}async function S(e){const a=await E();return new Promise((r,s)=>{const o=a.transaction(e,"readwrite");o.objectStore(e).clear(),o.oncomplete=()=>r(),o.onerror=()=>s(o.error)})}const f={get:async()=>(await u(t.PERSONAL_INFO))[0],save:e=>A(t.PERSONAL_INFO,e),clear:()=>S(t.PERSONAL_INFO)},h={getAll:()=>u(t.EDUCATIONS),getById:e=>P(t.EDUCATIONS,e),save:e=>A(t.EDUCATIONS,e),delete:e=>I(t.EDUCATIONS,e),clear:()=>S(t.EDUCATIONS)},T={getAll:()=>u(t.EXPERIENCES),getById:e=>P(t.EXPERIENCES,e),save:e=>A(t.EXPERIENCES,e),delete:e=>I(t.EXPERIENCES,e),clear:()=>S(t.EXPERIENCES)},O={getAll:()=>u(t.SKILLS),save:e=>A(t.SKILLS,e),delete:e=>I(t.SKILLS,e),clear:()=>S(t.SKILLS)},g={getAll:()=>u(t.ATTACHMENTS),getById:e=>P(t.ATTACHMENTS,e),save:e=>A(t.ATTACHMENTS,e),delete:e=>I(t.ATTACHMENTS,e),clear:()=>S(t.ATTACHMENTS)},y={getAll:()=>u(t.QA_MATERIALS),save:e=>A(t.QA_MATERIALS,e),delete:e=>I(t.QA_MATERIALS,e),clear:()=>S(t.QA_MATERIALS)},b={getAll:()=>u(t.AI_CONFIGS),getActive:async()=>(await u(t.AI_CONFIGS)).find(a=>a.isActive),save:e=>A(t.AI_CONFIGS,e),delete:e=>I(t.AI_CONFIGS,e),clear:()=>S(t.AI_CONFIGS)},N={getAll:()=>u(t.APPLICATION_RECORDS),getById:e=>P(t.APPLICATION_RECORDS,e),save:e=>A(t.APPLICATION_RECORDS,e),delete:e=>I(t.APPLICATION_RECORDS,e),clear:()=>S(t.APPLICATION_RECORDS)};async function q(){const[e,a,r,s,o,n,l,i]=await Promise.all([f.get(),h.getAll(),T.getAll(),O.getAll(),g.getAll(),y.getAll(),b.getAll(),N.getAll()]);return{version:x,exportedAt:new Date().toISOString(),personalInfo:e||v(),educations:a,experiences:r,skills:s,attachments:o,qaMaterials:n,aiConfigs:l,applicationRecords:i}}async function K(e){var r,s,o,n,l,i,m;await Promise.all([f.clear(),h.clear(),T.clear(),O.clear(),g.clear(),y.clear(),b.clear(),N.clear()]);const a=[];e.personalInfo&&a.push(f.save(e.personalInfo)),(r=e.educations)==null||r.forEach(c=>a.push(h.save(c))),(s=e.experiences)==null||s.forEach(c=>a.push(T.save(c))),(o=e.skills)==null||o.forEach(c=>a.push(O.save(c))),(n=e.attachments)==null||n.forEach(c=>a.push(g.save(c))),(l=e.qaMaterials)==null||l.forEach(c=>a.push(y.save(c))),(i=e.aiConfigs)==null||i.forEach(c=>a.push(b.save(c))),(m=e.applicationRecords)==null||m.forEach(c=>a.push(N.save(c))),await Promise.all(a)}function v(){const e=new Date().toISOString();return{id:D(),name:"",gender:"",birthDate:"",phone:"",email:"",targetCities:[],targetPositions:[],createdAt:e,updatedAt:e}}const Q=Object.freeze(Object.defineProperty({__proto__:null,aiConfigDB:b,applicationDB:N,attachmentDB:g,createEmptyPersonalInfo:v,educationDB:h,experienceDB:T,exportAllData:q,generateId:D,importAllData:K,personalInfoDB:f,qaMaterialDB:y,skillDB:O},Symbol.toStringTag,{value:"Module"}));export{k as P,T as a,b,J as c,X as d,h as e,v as f,D as g,B as h,q as i,K as j,Q as k,H as l,f as p,O as s};
