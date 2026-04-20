'use strict';

// Mini Template Engine
// 支援：
//   ${var}                  變數插值（undefined 時變空字串）
//   ${var|default}          有預設值
//   ${var.nested.path}      點路徑存取
//   {{#if var}}...{{/if}}   條件區塊
//   {{#if var}}A{{else}}B{{/if}}
//   {{#unless var}}...{{/unless}}
//
// 條件判斷：var 為 null/undefined/false/0/''/[]/{} → falsy
//
// 用途：narrative chapter templates、hook templates 等需要條件邏輯的文案

function isEmpty(v) {
  if (v == null || v === false || v === '' || v === 0) return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'object' && Object.keys(v).length === 0) return true;
  return false;
}

function getPath(obj, dotted) {
  const parts = dotted.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function interp(template, vars) {
  if (typeof template !== 'string') return template;

  // 先處理 {{#if}} / {{#unless}} 區塊（遞迴支援簡單嵌套）
  let result = template;
  let changed = true;
  while (changed) {
    changed = false;

    // {{#if var}}A{{else}}B{{/if}}  或  {{#if var}}A{{/if}}
    result = result.replace(
      /\{\{#if\s+([\w.]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
      (_, varName, truthy, falsy) => {
        changed = true;
        const v = getPath(vars, varName);
        return !isEmpty(v) ? truthy : (falsy ?? '');
      }
    );

    // {{#unless var}}A{{/unless}}
    result = result.replace(
      /\{\{#unless\s+([\w.]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g,
      (_, varName, body) => {
        changed = true;
        const v = getPath(vars, varName);
        return isEmpty(v) ? body : '';
      }
    );
  }

  // ${var} / ${var|default} / ${var.path}
  result = result.replace(/\$\{([\w.]+)(?:\|([^}]*))?\}/g, (_, varName, defaultVal) => {
    const v = getPath(vars, varName);
    if (v == null) return defaultVal ?? '';
    return String(v);
  });

  return result;
}

// 同一個 template spec 可能是 string 或 object（多候選依條件選一個）
// object 形式：
//   { when: 'var.path', then: 'tpl A', else: 'tpl B' }
// 或陣列形式（多條件，依序嘗試）：
//   [{ when: 'a.b', then: 'X' }, { when: 'c.d', then: 'Y' }, 'fallback']
function render(spec, vars) {
  if (spec == null) return '';
  if (typeof spec === 'string') return interp(spec, vars);

  if (Array.isArray(spec)) {
    for (const item of spec) {
      const rendered = render(item, vars);
      if (rendered) return rendered;
    }
    return '';
  }

  if (typeof spec === 'object') {
    if (spec.when) {
      const v = getPath(vars, spec.when);
      if (!isEmpty(v)) return render(spec.then, vars);
      if (spec.else) return render(spec.else, vars);
      return '';
    }
    if (spec.template) return interp(spec.template, vars);
  }

  return '';
}

module.exports = { interp, render, getPath, isEmpty };
