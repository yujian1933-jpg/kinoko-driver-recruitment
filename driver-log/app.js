'use strict';
const START = '2026-09-16', END = '2026-10-06', OT = 600;
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let token = null, me = null, entries = [], expenses = [], sheets = [], submittedAt = null, tab = 'work';

const BASE = /workers\.dev$/.test(location.hostname) ? '' : 'https://cola-dispatch.marswave-543.workers.dev/app-b619b1/';
const ROSTER = [['driver-01', '曾東德'], ['driver-02', '野町加代子'], ['driver-03', '石振宇'], ['driver-04', '赵远声'], ['driver-05', '刘英杰'], ['driver-06', '袁东'], ['driver-07', '曹中博'], ['driver-08', '刘健南'], ['driver-09', '刘军'], ['driver-10', '苏畅']];
let teamKey = null, showTest = false;
(function initToken() {
  const km = /[#&]k=([^&]+)/.exec(location.hash);
  if (km) { localStorage.setItem('kd-key', decodeURIComponent(km[1])); if (/[#&]test=1/.test(location.hash)) localStorage.setItem('kd-test', '1'); else localStorage.removeItem('kd-test'); history.replaceState(null, '', location.pathname); }
  teamKey = localStorage.getItem('kd-key'); showTest = localStorage.getItem('kd-test') === '1';
  token = localStorage.getItem('kd-tk');
})();

/* 本机临时保存：误触退出后重新打开，已填内容还在 */
const K = (s) => `kd:${me ? me.driverId : 'x'}:${s}`;
const dget = (k) => { try { return JSON.parse(localStorage.getItem(K(k))); } catch { return null; } };
const dset = (k, v) => { try { localStorage.setItem(K(k), JSON.stringify(v)); } catch { /* ignore */ } };
const ddel = (k) => { try { localStorage.removeItem(K(k)); } catch { /* ignore */ } };

function days() {
  const out = []; const d = new Date(START + 'T00:00:00Z'), e = new Date(END + 'T00:00:00Z');
  for (; d <= e; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
const label = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 周${WD[d.getUTCDay()]}`; };
const hm = (min) => `${Math.floor(min / 60)}小时${min % 60}分钟`;
function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, err ? 5000 : 2200); }

async function api(path, opts = {}) {
  const headers = { Authorization: 'Bearer ' + token, ...(opts.headers || {}) };
  let res;
  try { res = await fetch(BASE + path.replace(/^\//, ''), { ...opts, headers }); } catch { throw new Error('网络不通，请检查信号后再试'); }
  let data = null; try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(data?.error || data?.message || `出错了（${res.status}）`);
  return data;
}

const urlCache = new Map();
async function fileUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const r = await fetch(BASE + 'api/files/' + id, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('x');
  const u = URL.createObjectURL(await r.blob()); urlCache.set(id, u); return u;
}
const thumb = (f) => `<div class="th" data-fid="${f.id}"><img alt="">${submittedAt ? '' : `<button class="x" data-del="${f.id}" aria-label="删除">×</button>`}</div>`;
function hydrate(root) {
  root.querySelectorAll('.th[data-fid]').forEach(async (el) => {
    try { el.querySelector('img').src = await fileUrl(el.dataset.fid); }
    catch { el.classList.add('bad'); el.querySelector('img').replaceWith(Object.assign(document.createElement('span'), { textContent: '无法预览' })); }
  });
}
function localLightbox(src) {
  const o = document.createElement('div'); o.className = 'lb';
  o.innerHTML = `<img alt="" src="${src}"><div class="lbbar"><button class="lbb" id="lbclose">关闭</button></div>`;
  document.body.appendChild(o);
  o.querySelector('#lbclose').onclick = () => o.remove();
  o.addEventListener('click', (e) => { if (e.target === o) o.remove(); });
}
function lightbox(id) {
  const o = document.createElement('div'); o.className = 'lb';
  o.innerHTML = `<img alt=""><div class="lbbar"><button class="lbb" id="lbclose">关闭</button>${submittedAt ? '' : '<button class="lbb del" id="lbdel">删除这张</button>'}</div>`;
  fileUrl(id).then((u) => { o.querySelector('img').src = u; }).catch(() => toast('图片无法预览', true));
  document.body.appendChild(o);
  o.querySelector('#lbclose').onclick = () => o.remove();
  o.addEventListener('click', (e) => { if (e.target === o) o.remove(); });
  o.querySelector('#lbdel')?.addEventListener('click', async () => { if (await delFile(id)) o.remove(); });
}
let afterDelete = null;
async function delFile(id) {
  if (!confirm('确定删除这张照片吗？删除后需要重新上传。')) return false;
  try { await api('/api/files/' + id, { method: 'DELETE' }); urlCache.delete(id); await load2(); if (afterDelete) afterDelete(); toast('已删除'); return true; }
  catch (e) { toast(e.message, true); return false; }
}
document.addEventListener('click', (e) => {
  const d = e.target.closest('[data-del]'); if (d) { e.preventDefault(); e.stopPropagation(); delFile(d.dataset.del); return; }
  const t = e.target.closest('.th[data-fid] img'); if (t) lightbox(t.closest('.th').dataset.fid);
  const n = e.target.closest('.th:not([data-fid]) img'); if (n && n.src) localLightbox(n.src);
}, true);

async function shrink(file) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}
async function uploadFile(file, kind, recordId) {
  const f = await shrink(file);
  const fd = new FormData(); fd.append('file', f, f.name || 'photo.jpg'); fd.append('kind', kind); if (recordId) fd.append('recordId', recordId);
  return api('/api/uploads', { method: 'POST', body: fd });
}

function pickWho(msg) {
  const list = showTest ? [...ROSTER, ['driver-99', '测试账号（可忽略）']] : ROSTER;
  $('#app').innerHTML = `<div class="hello">请选择你的名字</div><div class="note">${esc(msg || '只点你自己的名字。选错了别人的，会把别人的记录弄乱。')}</div><div class="pickgrid">${list.map(([id, n]) => `<button data-id="${id}">${esc(n)}</button>`).join('')}</div><p class="center" style="margin:28px 0 8px"><a href="admin.html" style="color:#8B6914;font-size:13px;text-decoration:none;border-bottom:1px solid #d8cfb8">管理员入口</a></p>`;
  document.querySelectorAll('.pickgrid button').forEach((b) => b.onclick = () => askPin(b.dataset.id, b.textContent));
}
function askPin(id, name, msg) {
  $('#app').innerHTML = `<div class="hello">${esc(name)}</div><div class="note">${esc(msg || '请输入公司发给你的 4 位数字密码。')}</div><div style="margin-top:14px"><input id="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" placeholder="4 位数字密码" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;font-size:20px;letter-spacing:8px;text-align:center"></div><div style="height:12px"></div><button class="btn" id="pinok" style="width:100%">确认</button><div style="height:10px"></div><button class="btn cancel" id="pinback" style="width:100%">返回，重新选择名字</button>`;
  const go = async () => {
    const pin = $('#pin').value.trim();
    if (!/^\d{4}$/.test(pin)) return toast('请输入 4 位数字密码', true);
    const ok = $('#pinok'); ok.disabled = true; ok.textContent = '验证中…';
    try {
      const r = await api('/api/enter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: teamKey, driverId: id, pin }) });
      token = r.token; localStorage.setItem('kd-tk', token); load();
    } catch (e) { ok.disabled = false; ok.textContent = '确认'; toast(e.message, true); $('#pin').value = ''; $('#pin').focus(); }
  };
  $('#pinok').onclick = go; $('#pin').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  $('#pinback').onclick = () => pickWho();
  setTimeout(() => $('#pin').focus(), 50);
}
async function load() {
  if (!teamKey) return noAccess('链接不完整，请用公司发给你的完整链接重新打开。');
  if (!token) return pickWho();
  try {
    me = await api('/api/me');
    if (me.role !== 'driver') { token = null; localStorage.removeItem('kd-tk'); return pickWho(); }
    $('#app').innerHTML = '';
    await load2();
    const o = dget('open');
    if (o && o.k === 'w' && days().includes(o.d)) workSheet(o.d);
    else if (o && o.k === 'x') { tab = 'exp'; render(); expSheet(o.id ? expenses.find((x) => x.id === o.id) : null); }
  } catch (e) {
    if (/401|无效|过期|Bearer/.test(e.message)) { token = null; localStorage.removeItem('kd-tk'); return pickWho('登录已失效，请重新选择你的名字。'); }
    noAccess(e.message);
  }
}
function noAccess(msg) { $('#app').innerHTML = `<p class="center">${esc(msg)}</p><p class="center" style="margin:28px 0 8px"><a href="admin.html" style="color:#8B6914;font-size:13px;text-decoration:none;border-bottom:1px solid #d8cfb8">管理员入口</a></p>`; }

const entryOf = (d) => entries.find((e) => e.date === d);
const isRest = (e) => e && !e.startTime && !e.endTime && /^休息/.test(e.note || '');
function entryState(e) {
  if (!e) return ['待填', ''];
  if (isRest(e)) return ['休息', ''];
  if (e.status === 'approved') return ['已确认', 'ok'];
  if (e.status === 'needs_fix') return ['需修改', 'bad'];
  if (e.incomplete) return ['缺' + (e.missing || []).map((m) => ({ startTime: '出库', endTime: '归库' }[m])).filter(Boolean).join('、'), 'warn'];
  return ['已保存', 'ok'];
}
const fmtTime = (iso) => { const d = new Date(new Date(iso).getTime() + 9 * 3600e3); return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
function submitBlock() {
  if (submittedAt) return `<div class="done">✅ 已提交<small>提交时间：${fmtTime(submittedAt)}。已提交的内容不能再修改；如需修改，请联系公司。</small></div>`;
  const bl = blockers();
  return `<div class="warnbox"><b>提交前请注意</b><div>所有内容全部填写完并确认无误后，再点击提交。<u>提交后不可再修改。</u></div></div>`
    + `<div class="submitbox"><button class="btn" id="submit" ${bl.length ? 'disabled' : ''}>提交</button><div class="note" style="text-align:center">${bl.length ? '带 * 的必填项和照片都补完后，才能提交。' : '全部内容已填完，确认无误后可以提交。'}</div></div>`;
}
function blockers() {
  const ds = days(), out = [];
  const miss = ds.filter((d) => { const e = entryOf(d); return !isRest(e) && (!e || e.incomplete); });
  if (miss.length) out.push(`有 ${miss.length} 天工时没填完：${miss.slice(0, 8).map((d) => label(d).split(' ')[0]).join('、')}${miss.length > 8 ? '等' : ''}（没有出车的日子，请在当天点“本日未出车”）`);
  if (!sheets.length) out.push('工时签字凭证照片还没有上传');
  const nr = expenses.filter((x) => x.incomplete).length;
  if (nr) out.push(`有 ${nr} 笔垫付缺票据照片`);
  return out;
}
async function doSubmit() {
  const bl = blockers();
  if (bl.length) return alert('还不能提交，请先补完：\n\n' + bl.map((t, i) => `${i + 1}. ${t}`).join('\n'));
  if (!confirm(`以「${me.driverName}」的名义提交？\n\n提交后不能再修改，请确认所有内容都已填完并核对无误。`)) return;
  const b = $('#submit'); b.disabled = true; b.textContent = '提交中…';
  try { const r = await api('/api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); submittedAt = r.submittedAt; render(); window.scrollTo(0, document.body.scrollHeight); toast('已提交'); }
  catch (e) { toast(e.message, true); render(); }
}
function render() {
  const ds = days(), done = ds.filter((d) => { const e = entryOf(d); return e && !e.incomplete; }).length;
  const total = entries.reduce((a, e) => a + (e.minutes || 0), 0), ot = entries.reduce((a, e) => a + (e.overtimeMinutes || 0), 0);
  const yen = expenses.reduce((a, e) => a + (e.amountYen || 0), 0);
  const prog = `<div class="progress"><b>工时已完整填 ${done} / ${ds.length} 天</b><div class="bar"><i style="width:${done / ds.length * 100}%"></i></div>
    <div class="note">累计 ${hm(total)} · 超时 ${hm(ot)}</div></div>`;
  let h = `<div class="who"><div><small>当前填写人</small><b>${esc(me.driverName)}</b></div><button id="switch">不是我？切换</button></div>
    <div class="tabs"><button data-t="work" class="${tab === 'work' ? 'on' : ''}">每日工时</button><button data-t="exp" class="${tab === 'exp' ? 'on' : ''}">垫付费用</button><button data-t="sub" class="${tab === 'sub' ? 'on' : ''}">提交</button></div>`;
  if (tab === 'work') {
    h += prog + ds.map((d) => { const e = entryOf(d), [t, c] = entryState(e);
      const s = e ? `${e.startTime || '--'} → ${e.endTime || '--'}${e.nextDay ? '（次日）' : ''}${e.overtimeMinutes ? ' · 超时' + hm(e.overtimeMinutes) : ''}` : '点这里填写';
      return `<button class="day" data-d="${d}"><div><div class="d">${label(d)}</div><div class="s">${esc(s)}</div></div><span class="tag ${c}">${esc(t)}</span></button>`; }).join('')
      + `<div class="progress" style="margin-top:16px"><b>📋 工时签字凭证照片，可上传多张</b>
      <div class="thumbs">${sheets.length ? sheets.map(thumb).join('') : '<span style="background:#fbeee0;color:#b26a1b">还没有上传</span>'}</div>
      ${submittedAt ? '' : '<div class="note">点缩略图可放大查看，点右上角 × 可删除传错的照片。</div><label class="pick" style="margin-top:12px"><input type="file" id="sheetph" accept="image/*" multiple>📷 拍照 / 选择照片</label>'}</div>`;
  } else if (tab === 'exp') {
    h += `<div class="progress"><b>垫付合计 ¥${yen.toLocaleString()}</b><div class="note">共 ${expenses.length} 笔。没有垫付就不用填。</div></div>${submittedAt ? '' : '<button class="btn gold" id="addx" style="margin-bottom:12px">＋ 添加一笔垫付</button>'}`
      + expenses.map((e) => `<button class="day" data-x="${e.id}"><div><div class="d">¥${(e.amountYen || 0).toLocaleString()} · ${esc(e.category)}</div><div class="s">${label(e.date)} · ${esc(e.description)}</div></div><span class="tag ${e.incomplete ? 'warn' : 'ok'}">${e.incomplete ? '缺票据' : '已保存'}</span></button>`).join('');
  } else {
    const missD = ds.filter((d) => { const e = entryOf(d); return !isRest(e) && (!e || e.incomplete); });
    const nr = expenses.filter((x) => x.incomplete).length;
    const ok = (b, t) => `<div class="chk ${b ? 'ok' : 'no'}"><span>${b ? '✓' : '✗'}</span><div>${t}</div></div>`;
    h += `<div class="progress"><b>提交前核对</b>
      ${ok(!missD.length, `工时：已填 ${done} / ${ds.length} 天${missD.length ? `<small>没有出车的日子，请在当天点“本日未出车”。</small>` : ''}`)}
      ${ok(sheets.length > 0, `签字凭证照片：${sheets.length ? `已传 ${sheets.length} 张` : '尚未上传<small>请回到“每日工时”页最底部上传。</small>'}`)}
      ${ok(!nr, `垫付：${expenses.length} 笔，合计 ¥${yen.toLocaleString()}${nr ? `<small>有 ${nr} 笔缺票据照片。</small>` : ''}`)}</div>` + submitBlock();
  }
  $('#app').innerHTML = h; hydrate($('#app'));
  document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => { tab = b.dataset.t; render(); window.scrollTo(0, 0); });
  document.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => workSheet(b.dataset.d));
  document.querySelectorAll('[data-x]').forEach((b) => b.onclick = () => expSheet(expenses.find((x) => x.id === b.dataset.x)));
  $('#addx')?.addEventListener('click', () => expSheet(null));
  $('#submit')?.addEventListener('click', doSubmit);
  $('#switch')?.addEventListener('click', () => { if (!confirm(`当前是「${me.driverName}」。确定要换成别的名字吗？\n（已保存的内容不会丢）`)) return; token = null; localStorage.removeItem('kd-tk'); me = null; pickWho(); });
  $('#sheetph')?.addEventListener('change', async (ev) => {
    const fs = [...ev.target.files]; let ok = 0;
    for (const f of fs) { try { toast(`上传中 ${ok + 1}/${fs.length}…`); await uploadFile(f, 'work_sheet'); ok++; } catch (x) { toast('上传失败：' + x.message, true); break; } }
    if (ok) { await load2(); toast(`已上传 ${ok} 张`); }
  });
}

function sheet(html, openState) {
  const s = document.createElement('div'); s.className = 'sheet'; s.innerHTML = `<div class="panel">${html}</div>`;
  const raw = s.remove.bind(s);
  s.remove = () => { raw(); ddel('open'); };
  s.addEventListener('click', (e) => { if (e.target === s) s.remove(); });
  if (openState) dset('open', openState);
  document.body.appendChild(s); return s;
}
function calc(start, end, next) {
  if (!start || !end) return null;
  const [a, b] = [start, end].map((t) => +t.slice(0, 2) * 60 + +t.slice(3, 5));
  let m = b - a; if (next || m <= 0) m += 1440;
  return m;
}
function workSheet(date) {
  if (submittedAt) return toast('已提交，不能再修改', true);
  const e = entryOf(date) || {};
  if (e.status === 'approved') { ddel('open'); return toast('这一天已确认，不能再改', true); }
  const dk = 'w:' + date, dr = dget(dk);
  const v = dr || { st: e.startTime || '', en: e.endTime || '', nt: e.note || '' };
  const s = sheet(`<h2>${label(date)}</h2><div class="note">出库到归库的全部时间（含迎车、回送）；超过10小时为超时。<br>带 <span class="req">*</span> 的为必填，没填完无法最终提交。没有出车的日子，请点“本日未出车”。</div>
    ${dr ? '<div class="restored">已恢复你上次没来得及保存的内容，请检查后点“保存”。</div>' : ''}
    <div class="row"><div><label>出库时间 <span class="req">*</span></label><input type="time" id="st" value="${esc(v.st)}"></div><div><label>归库时间 <span class="req">*</span></label><input type="time" id="en" value="${esc(v.en)}"></div></div>
    <div id="calc" class="calc" hidden></div>
    <label>备注</label><input id="nt" maxlength="200" value="${esc(v.nt)}">
    <button class="btn" id="save">保存</button><button class="btn restbtn" id="rest">本日未出车</button><button class="btn ghost" id="cancel">取消（不保存本次修改）</button>`, { k: 'w', d: date });
  const keep = () => dset(dk, { st: $('#st', s).value, en: $('#en', s).value, nt: $('#nt', s).value });
  const upd = () => { const m = calc($('#st', s).value, $('#en', s).value), c = $('#calc', s);
    if (m == null) return c.hidden = true; c.hidden = false; const o = Math.max(0, m - OT);
    c.className = 'calc' + (o ? ' over' : ''); c.textContent = `工作 ${hm(m)}` + (o ? `，超时 ${hm(o)}` : '，未超时') + ($('#en', s).value <= $('#st', s).value ? '（已按过了午夜计算）' : ''); };
  $('#st', s).oninput = $('#en', s).oninput = () => { upd(); keep(); }; $('#nt', s).oninput = keep; upd();
  $('#cancel', s).onclick = () => { ddel(dk); s.remove(); };
  $('#rest', s).onclick = () => { if (!confirm('确认本日未出车？\n已填的出库、归库时间将清空。')) return; $('#st', s).value = ''; $('#en', s).value = ''; $('#nt', s).value = '休息'; $('#save', s).click(); };
  $('#save', s).onclick = async () => {
    const btn = $('#save', s), st = $('#st', s).value, en = $('#en', s).value;
    if (!!st !== !!en && !confirm('只填了一头的时间，会标记成“待补”。继续保存？')) return;
    btn.disabled = true; btn.textContent = '保存中…';
    try {
      const body = { date, startTime: st || null, endTime: en || null, nextDay: !!(st && en && en <= st), note: $('#nt', s).value.trim() };
      let id = e.id;
      if (id) await api('/api/entries/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      else id = (await api('/api/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).id;
      ddel(dk); await load2(); s.remove(); toast('已保存');
    } catch (x) { btn.disabled = false; btn.textContent = '保存'; toast(x.message, true); }
  };
}
const TYPES = ['停车费', '高速费', '加油费', '其他'];
function expSheet(x) {
  if (submittedAt) return toast('已提交，不能再修改', true);
  x = x || {};
  const dk = 'x:' + (x.id || 'new'), dr = dget(dk);
  const v = dr || { dt: x.date || '', ct: x.category || '', ds: x.description || '', am: x.amountYen ?? '' };
  const s = sheet(`<h2>${x.id ? '修改垫付' : '添加一笔垫付'}</h2>
    ${dr ? '<div class="restored">已恢复你上次没来得及保存的内容（票据照片需要重新选择）。</div>' : ''}
    <div class="note">带 <span class="req">*</span> 的为必填（含票据照片），没填完无法最终提交。</div><label>发生日期 <span class="req">*</span></label><select id="dt">${days().map((d) => `<option value="${d}" ${d === v.dt ? 'selected' : ''}>${label(d)}</option>`).join('')}</select>
    <label>类型 <span class="req">*</span></label><select id="ct">${TYPES.map((t) => `<option ${t === v.ct ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <label>用途 / 地点 <span class="req">*</span></label><input id="ds" maxlength="100" value="${esc(v.ds)}" placeholder="例如：名古屋城停车场">
    <label>金额（日元） <span class="req">*</span></label><input id="am" type="number" inputmode="numeric" min="0" value="${esc(v.am)}">
    <label>票据照片 <span class="req">*</span></label><label class="pick"><input type="file" id="ph" accept="image/*" multiple>📷 拍照 / 选择照片</label>
    <div class="thumbs" id="have">${(x.attachments || []).map(thumb).join('')}</div><div class="thumbs" id="new"></div><div class="note">点缩略图可放大，点 × 可删除传错的照片。</div>
    <button class="btn" id="save">保存</button><button class="btn cancel" id="cancel">取消（不保存本次修改）</button>${x.id ? '<button class="btn delbox" id="delx">删除这笔垫付</button>' : ''}`, { k: 'x', id: x.id || null });
  const keep = () => dset(dk, { dt: $('#dt', s).value, ct: $('#ct', s).value, ds: $('#ds', s).value, am: $('#am', s).value });
  ['#dt', '#ct', '#ds', '#am'].forEach((q) => { $(q, s).oninput = keep; $(q, s).onchange = keep; });
  if (!dr) keep();
  hydrate(s);
  afterDelete = () => { const cur = expenses.find((q) => q.id === x.id); if (cur && $('#have', s)) { x = cur; $('#have', s).innerHTML = (x.attachments || []).map(thumb).join(''); hydrate($('#have', s)); } };
  const oldRemove = s.remove; s.remove = () => { afterDelete = null; oldRemove(); };
  $('#delx', s)?.addEventListener('click', async () => { if (!confirm('确定删除这笔垫付（含所有票据照片）吗？')) return; try { await api('/api/expenses/' + x.id, { method: 'DELETE' }); ddel(dk); await load2(); s.remove(); toast('已删除'); } catch (e) { toast(e.message, true); } });
  const files = [];
  const showNew = () => { $('#new', s).innerHTML = files.map((f, i) => `<div class="th"><img alt="" src="${URL.createObjectURL(f)}"><button class="x" data-rm="${i}" aria-label="移除">×</button></div><span class="newtag">待保存</span>`).join(''); $('#new', s).querySelectorAll('[data-rm]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); files.splice(+b.dataset.rm, 1); showNew(); }); };
  $('#ph', s).onchange = (ev) => { files.push(...ev.target.files); ev.target.value = ''; showNew(); };
  $('#cancel', s).onclick = () => { ddel(dk); s.remove(); };
  $('#save', s).onclick = async () => {
    const btn = $('#save', s), amt = $('#am', s).value, desc = $('#ds', s).value.trim();
    if (amt === '' || +amt < 0 || !Number.isInteger(+amt)) return toast('请填写金额（整数日元）', true);
    if (!desc) return toast('请填写用途', true);
    btn.disabled = true; btn.textContent = '保存中…';
    try {
      const body = { date: $('#dt', s).value, category: $('#ct', s).value, description: desc, amountYen: +amt, note: '' };
      let id = x.id;
      if (id) await api('/api/expenses/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      else id = (await api('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).id;
      ddel(dk);
      let failed = 0;
      for (const f of files) { try { await uploadFile(f, 'receipt', id); } catch (e) { failed++; toast('照片上传失败：' + e.message, true); } }
      x = { ...x, id }; await load2();
      if (failed) { btn.disabled = false; btn.textContent = '保存（重新上传失败的照片）'; files.length = 0; return; }
      s.remove(); toast('已保存');
    } catch (e) { btn.disabled = false; btn.textContent = '保存'; toast(e.message, true); }
  };
}
async function load2() {
  let sub;
  [entries, expenses, sheets, sub] = await Promise.all([api('/api/entries').then((r) => r.records || r.entries || r), api('/api/expenses').then((r) => r.records || r.expenses || r), api('/api/sheets').then((r) => r.sheets || r.records || r), api('/api/submit').catch(() => ({}))]);
  submittedAt = sub && sub.submittedAt || null;
  render();
}
load();
