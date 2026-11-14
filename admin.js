// ส่วนจัดการของผู้จัด: ตั้งค่า / รายการแข่ง / ทีม
const h = (t, a = {}, ...c) => {
  const e = document.createElement(t);
  for (const [k, v] of Object.entries(a)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v; else if (k in e) e[k] = v; else e.setAttribute(k, v);
  }
  e.append(...c.filter(x => x != null && x !== false));
  return e;
};
const must = r => { if (r.error) throw r.error; return r.data; };
const SYS = {round_robin: 'พบกันหมด', knockout: 'แพ้คัดออก', group_knockout: 'แบ่งสาย + น็อกเอาต์'};
const TB = {
  a: {k: ['points', 'head_to_head', 'goal_diff', 'goals_for', 'draw'], t: 'พบกันเอง → ผลต่าง → คะแนนที่ทำได้ → จับสลาก'},
  b: {k: ['points', 'goal_diff', 'goals_for', 'head_to_head', 'draw'], t: 'ผลต่าง → คะแนนที่ทำได้ → พบกันเอง → จับสลาก'}
};
const tbKey = a => (a && a[1] === 'goal_diff') ? 'b' : 'a';
const sportName = s => `${s.name} ${s.age_group} (${s.gender})`;
const lab = (t, i) => h('label', {}, t, i);
const opt = (v, t, cur) => h('option', {value: v, selected: v === cur}, t);

let tab = 'settings', editing = null, curSport = null;
const note = h('p', {class: 'note', role: 'status'});
const flash = (t, bad) => { note.textContent = t; note.className = 'note' + (bad ? ' bad' : ''); };
const fail = (e, dup) => flash(e.code === '23505' && dup ? dup : 'บันทึกไม่สำเร็จ: ' + e.message, true);
const refresh = async () => { await render(); if (typeof loadHome === 'function') loadHome(); };

function initAdmin(isAdmin) {
  const box = document.getElementById('adminTools');
  box.classList.toggle('hide', !isAdmin);
  if (isAdmin) render(); else box.replaceChildren();
}

async function render() {
  const body = h('div');
  const tabs = [['settings', 'ตั้งค่า'], ['sports', 'รายการแข่ง'], ['teams', 'ทีม'], ['play', 'แข่งขัน']];
  document.getElementById('adminTools').replaceChildren(
    h('div', {class: 'seg'}, ...tabs.map(([k, l]) =>
      h('button', {class: k === tab ? 'on' : '', onclick: () => { tab = k; editing = null; flash(''); render(); }}, l))),
    note, body);
  try { await {settings: viewSettings, sports: viewSports, teams: viewTeams, play: viewPlay}[tab](body); }
  catch (e) { flash('โหลดข้อมูลไม่สำเร็จ: ' + e.message, true); }
}

// ---------- ตั้งค่า + สนาม ----------
async function viewSettings(body) {
  const [s, venues] = (await Promise.all([
    db.from('settings').select('*').single(),
    db.from('venues').select('*').order('name')])).map(must);
  const f = {};
  const fld = (k, label, type) => lab(label, f[k] = h('input', {type, value: type === 'time' ? String(s[k] ?? '').slice(0, 5) : (s[k] ?? '')}));
  const save = async () => {
    const v = Object.fromEntries(Object.entries(f).map(([k, i]) => [k, i.value || null]));
    if (!v.event_name) return flash('กรอกชื่องานแข่งขัน', true);
    if (v.start_date && v.end_date && v.end_date < v.start_date) return flash('วันสุดท้ายต้องไม่ก่อนวันเริ่ม', true);
    if (!(v.day_start && v.day_end && v.lunch_start && v.lunch_end)) return flash('กรอกเวลาให้ครบ', true);
    if (!(v.day_start < v.lunch_start && v.lunch_start < v.lunch_end && v.lunch_end < v.day_end))
      return flash('พักกลางวันต้องอยู่ระหว่างเวลาเริ่มและเวลาเลิกแข่ง', true);
    const {error} = await db.from('settings').update(v).eq('id', 1);
    if (error) return fail(error);
    flash('บันทึกการตั้งค่าแล้ว'); refresh();
  };
  const nv = h('input', {placeholder: 'ชื่อสนาม'});
  const addVenue = async () => {
    const name = nv.value.replace(/\s+/g, ' ').trim();
    if (!name) return flash('พิมพ์ชื่อสนามก่อน', true);
    const {error} = await db.from('venues').insert({name});
    if (error) return fail(error, 'มีสนามชื่อนี้แล้ว');
    flash('เพิ่มสนามแล้ว'); refresh();
  };
  const delVenue = async v => {
    if (!confirm(`ลบสนาม "${v.name}"? นัดที่จัดสนามนี้ไว้จะกลายเป็นยังไม่กำหนดสนาม`)) return;
    const {error} = await db.from('venues').delete().eq('id', v.id);
    if (error) return fail(error);
    flash('ลบสนามแล้ว'); refresh();
  };
  body.append(
    h('div', {class: 'card'}, h('h2', {}, 'ข้อมูลการแข่งขัน'),
      fld('event_name', 'ชื่องาน', 'text'),
      h('div', {class: 'two'}, fld('start_date', 'วันเริ่ม', 'date'), fld('end_date', 'วันสุดท้าย', 'date')),
      h('div', {class: 'two'}, fld('day_start', 'เริ่มแข่งวันละ', 'time'), fld('day_end', 'เลิกแข่งวันละ', 'time')),
      h('div', {class: 'two'}, fld('lunch_start', 'พักกลางวันตั้งแต่', 'time'), fld('lunch_end', 'พักกลางวันถึง', 'time')),
      h('button', {class: 'btn', onclick: save}, 'บันทึกการตั้งค่า')),
    h('div', {class: 'card'}, h('h2', {}, `สนามแข่ง (${venues.length})`),
      ...(venues.length
        ? venues.map(v => h('div', {class: 'row'}, h('span', {}, v.name), h('button', {class: 'sm del', onclick: () => delVenue(v)}, 'ลบ')))
        : [h('p', {class: 'mut'}, 'ยังไม่มีสนาม เพิ่มอย่างน้อย 1 สนาม')]),
      nv, h('button', {class: 'btn alt', onclick: addVenue}, 'เพิ่มสนาม')));
}

// ---------- รายการแข่ง ----------
async function viewSports(body) {
  const [sports, venues, sv, teams] = (await Promise.all([
    db.from('sports').select('*').order('name').order('age_group'),
    db.from('venues').select('*').order('name'),
    db.from('sport_venues').select('*'),
    db.from('teams').select('sport_id')])).map(must);
  const e = sports.find(x => x.id === editing) || {};
  const f = {};
  const num = (k, label, ph, min, def) => lab(label, f[k] = h('input', {type: 'number', min, inputMode: 'numeric', placeholder: ph, value: e[k] ?? def ?? ''}));
  f.name = h('input', {value: e.name ?? '', placeholder: 'เช่น ฟุตบอล'});
  f.age = h('input', {value: e.age_group ?? '', placeholder: 'เช่น ป.4–ป.6 หรือ ม.1–ม.3'});
  f.gender = h('select', {}, ...['ชาย', 'หญิง', 'ผสม', 'ไม่แยก'].map(g => opt(g, g, e.gender ?? 'ไม่แยก')));
  f.system = h('select', {onchange: () => gk.classList.toggle('hide', f.system.value !== 'group_knockout')},
    ...Object.entries(SYS).map(([k, t]) => opt(k, t, e.system ?? 'group_knockout')));
  f.third = h('input', {type: 'checkbox', checked: !!e.third_place});
  f.tb = h('select', {}, ...Object.entries(TB).map(([k, o]) => opt(k, o.t, tbKey(e.tiebreak))));
  const q = String(e.qualifiers ?? '');
  f.qualifiers = h('select', {}, opt('', 'ให้ระบบเสนอ', q), ...[2, 4, 8, 16].map(n => opt(String(n), n + ' ทีม', q)));
  const gk = h('div', {class: 'two' + (f.system.value === 'group_knockout' ? '' : ' hide')},
    num('group_count', 'จำนวนสาย', 'ให้ระบบเสนอ', 2), lab('ทีมเข้ารอบน็อกเอาต์ (รวมทุกสาย)', f.qualifiers));
  const have = new Set(sv.filter(x => x.sport_id === e.id).map(x => x.venue_id));
  const vc = venues.map(v => h('label', {class: 'chk'}, h('input', {type: 'checkbox', value: v.id, checked: have.has(v.id)}), v.name));

  const save = async () => {
    const g = k => f[k].value, gkOn = g('system') === 'group_knockout';
    const p = {
      name: g('name').trim(), age_group: g('age').trim(), gender: g('gender'), system: g('system'),
      group_count: gkOn && g('group_count') ? +g('group_count') : null,
      qualifiers: gkOn && g('qualifiers') ? +g('qualifiers') : null,
      third_place: g('system') !== 'round_robin' && f.third.checked,
      minutes_per_match: +g('minutes_per_match'), min_rest_minutes: +g('min_rest_minutes'), tiebreak: TB[g('tb')].k
    };
    if (!p.name || !p.age_group) return flash('กรอกชื่อกีฬาและรุ่น', true);
    if (!(p.minutes_per_match > 0) || !(p.min_rest_minutes >= 0)) return flash('ตรวจเวลาต่อนัดและเวลาพัก', true);
    if (p.group_count && p.group_count < 2) return flash('จำนวนสายต้องไม่น้อยกว่า 2', true);
    if (p.group_count && p.qualifiers && p.qualifiers < p.group_count) return flash('ทีมเข้ารอบต้องไม่น้อยกว่าจำนวนสาย', true);
    if (e.draw_locked && (p.system !== e.system || p.group_count !== e.group_count || p.qualifiers !== e.qualifiers))
      return flash('ผลจับสลากถูกล็อกแล้ว เปลี่ยนระบบแข่งไม่ได้', true);
    const r = e.id ? await db.from('sports').update(p).eq('id', e.id).select('id').single()
                   : await db.from('sports').insert(p).select('id').single();
    if (r.error) return fail(r.error, 'มีรายการแข่งนี้แล้ว (กีฬา รุ่น เพศ ซ้ำกัน)');
    const ids = vc.map(l => l.firstChild).filter(i => i.checked).map(i => i.value);
    const d = await db.from('sport_venues').delete().eq('sport_id', r.data.id);
    if (d.error) return fail(d.error);
    if (ids.length) {
      const i = await db.from('sport_venues').insert(ids.map(v => ({sport_id: r.data.id, venue_id: v})));
      if (i.error) return fail(i.error);
    }
    editing = null; flash('บันทึกรายการแข่งแล้ว'); refresh();
  };
  const del = async (s, n) => {
    if (!confirm(`ลบ "${sportName(s)}"? ทีม (${n} ทีม) ผลจับสลาก และตารางแข่งของรายการนี้จะถูกลบทั้งหมด`)) return;
    const {error} = await db.from('sports').delete().eq('id', s.id);
    if (error) return fail(error);
    flash('ลบรายการแข่งแล้ว'); refresh();
  };

  const vn = Object.fromEntries(venues.map(v => [v.id, v.name]));
  body.append(
    h('div', {class: 'card'}, h('h2', {}, e.id ? 'แก้ไขรายการแข่ง' : 'เพิ่มรายการแข่ง'),
      lab('กีฬา', f.name), lab('รุ่น', f.age), lab('เพศ', f.gender), lab('ระบบการแข่งขัน', f.system), gk,
      h('label', {class: 'chk'}, f.third, 'จัดนัดชิงที่ 3 (รอบน็อกเอาต์)'),
      h('div', {class: 'two'}, num('minutes_per_match', 'นาทีต่อนัด', '', 5, 40), num('min_rest_minutes', 'พักระหว่างนัด (นาที)', '', 0, 60)),
      lab('เกณฑ์ตัดสินเมื่อคะแนนเท่ากัน (ผลต่าง = ประตู/เซต/แต้ม ตามกีฬา)', f.tb),
      h('p', {class: 'mut'}, 'สนามที่ใช้แข่ง'),
      ...(vc.length ? vc : [h('p', {class: 'mut'}, 'ยังไม่มีสนาม เพิ่มได้ที่แท็บตั้งค่า')]),
      h('button', {class: 'btn', onclick: save}, e.id ? 'บันทึกการแก้ไข' : 'เพิ่มรายการแข่ง'),
      e.id && h('button', {class: 'btn alt', style: 'margin-top:8px', onclick: () => { editing = null; render(); }}, 'ยกเลิก')),
    h('div', {class: 'card'}, h('h2', {}, `รายการแข่งทั้งหมด (${sports.length})`),
      ...(sports.length ? sports.map(s => {
        const n = teams.filter(t => t.sport_id === s.id).length;
        const vs = sv.filter(x => x.sport_id === s.id).map(x => vn[x.venue_id]).join(', ') || 'ยังไม่เลือก';
        return h('div', {class: 'row'},
          h('div', {}, h('b', {}, sportName(s)), h('div', {class: 'mut'}, `${SYS[s.system]}, ${n} ทีม`), h('div', {class: 'mut'}, 'สนาม: ' + vs)),
          h('div', {class: 'acts'},
            h('button', {class: 'sm', onclick: () => { editing = s.id; render(); window.scrollTo(0, 0); }}, 'แก้ไข'),
            h('button', {class: 'sm del', onclick: () => del(s, n)}, 'ลบ')));
      }) : [h('p', {class: 'mut'}, 'ยังไม่มีรายการแข่ง เพิ่มจากแบบฟอร์มด้านบน')])));
}

// ---------- ทีม ----------
async function viewTeams(body) {
  const sports = must(await db.from('sports').select('id,name,age_group,gender,draw_locked').order('name').order('age_group'));
  if (!sports.length) return body.append(h('p', {class: 'mut'}, 'ยังไม่มีรายการแข่ง เพิ่มที่แท็บ "รายการแข่ง" ก่อน'));
  if (!sports.some(s => s.id === curSport)) curSport = sports[0].id;
  const cur = sports.find(s => s.id === curSport);
  const teams = must(await db.from('teams').select('id,school').eq('sport_id', curSport).order('school'));
  const ta = h('textarea', {rows: 5, placeholder: 'พิมพ์ชื่อโรงเรียนทีละบรรทัด'});

  const add = async () => {
    const seen = new Set(teams.map(t => t.school.toLowerCase())), names = [];
    let skip = 0;
    for (const l of ta.value.split('\n')) {
      const n = l.replace(/\s+/g, ' ').trim();
      if (!n) continue;
      if (n.length > 120) return flash('ชื่อโรงเรียนยาวเกินไป', true);
      if (seen.has(n.toLowerCase())) skip++; else names.push(n);
      seen.add(n.toLowerCase());
    }
    if (!names.length) return flash(skip ? 'ทุกชื่อมีอยู่แล้วในรายการนี้' : 'พิมพ์ชื่อโรงเรียนก่อน', true);
    const {error} = await db.from('teams').insert(names.map(school => ({sport_id: curSport, school})));
    if (error) return fail(error, 'มีโรงเรียนซ้ำในรายการนี้');
    flash(`เพิ่ม ${names.length} ทีมแล้ว` + (skip ? `, ข้ามชื่อซ้ำ ${skip} ชื่อ` : '')); refresh();
  };
  const delTeam = async t => {
    if (!confirm(`ลบทีม "${t.school}" ออกจากรายการนี้?`)) return;
    const {error} = await db.from('teams').delete().eq('id', t.id);
    if (error) return fail(error);
    flash('ลบทีมแล้ว'); refresh();
  };

  body.append(
    h('div', {class: 'card'}, lab('รายการแข่ง', h('select', {onchange: ev => { curSport = ev.target.value; flash(''); render(); }},
      ...sports.map(s => opt(s.id, sportName(s), curSport))))),
    h('div', {class: 'card'}, h('h2', {}, `ทีมที่ลงแข่ง (${teams.length})`),
      ...(teams.length
        ? teams.map(t => h('div', {class: 'row'}, h('span', {}, t.school),
            cur.draw_locked ? null : h('button', {class: 'sm del', onclick: () => delTeam(t)}, 'ลบ')))
        : [h('p', {class: 'mut'}, 'ยังไม่มีทีม เพิ่มจากช่องด้านล่าง')])),
    cur.draw_locked
      ? h('p', {class: 'mut'}, 'ผลจับสลากถูกล็อกแล้ว เพิ่มหรือลบทีมไม่ได้')
      : h('div', {class: 'card'}, h('h2', {}, 'เพิ่มทีม'), ta, h('button', {class: 'btn', onclick: add}, 'เพิ่มทีม')));
}
