/**
 * 스탬프 도안 생성기 → 내 구글 드라이브 저장용 앱스스크립트 (v1 + v2 공용)
 *
 * ▸ v1 (stamp4student.vercel.app)
 *   '드라이브로 보내기' → 내 드라이브 「스탬프 도안」 폴더에 PNG 저장
 *
 * ▸ v2 (stamp4student.vercel.app/v2, 4학년 3반 stamp-maker를 옮겨 온 버전)
 *   '선생님께 보내기' → 내 드라이브 「도장도안_제출/학급(예: 4-2)」 폴더에
 *   「학급_번호_이름.png」로 저장하고, 「도장도안_제출」 안의 「제출기록」 시트에 한 줄 기록.
 *   같은 학생이 다시 보내면 예전 파일은 그 반의 「이전제출」 폴더로 옮김.
 *
 * 코드를 고친 뒤에는 [배포 → 배포 관리 → 연필 → 버전: 새 버전 → 배포]로 올려야
 * 웹 앱 주소가 바뀌지 않습니다.
 */

// ---------- v1 설정 ----------
const FOLDER_ID = '';            // 특정 폴더에 받고 싶으면 폴더 ID 입력
const FOLDER_NAME = '스탬프 도안';
const MAX_BYTES = 10 * 1024 * 1024;

// ---------- v2 설정 ----------
const V2_FOLDER_NAME = '도장도안_제출';
const V2_OLD_FOLDER_NAME = '이전제출';
const V2_SHEET_NAME = '제출기록';

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply_({ ok: false, status: 'error', message: '데이터를 읽지 못했어요.' });
  }
  if (data && data.image) return saveV2_(data);   // v2 형식
  return saveV1_(data);                            // v1 형식
}

// 주소를 브라우저로 열었을 때 연결 확인용
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'name') return lookupName_(p.cls, p.num);
  if (p.action === 'shared') return listShared_();
  if (p.action === 'sharedImg') return sharedImage_(p.id);
  return reply_({ ok: true, status: 'ok', message: '스탬프 도안 저장 서버가 동작 중입니다.' });
}

/* ===================== v2: 선생님 그림 (공유 그림 폴더) =====================
 * 내 드라이브의 「도장도안_공유그림」 폴더에 있는 그림을 학생 화면의 '선생님 그림'에 보여 줍니다.
 * - 폴더 바로 아래 그림 → '선생님 그림' 묶음
 * - 폴더 안의 하위 폴더 → 하위 폴더 이름이 묶음 이름 (예: 동물, 운동)
 * 다른 선생님과 이 폴더를 '편집자'로 공유하면, 그 선생님이 넣은 그림도 함께 보입니다.
 * 이 폴더 밖의 파일은 절대 내보내지 않습니다.
 */
const SHARED_FOLDER_NAME = '도장도안_공유그림';
const SHARED_MAX_FILES = 300;

function sharedRoot_() {
  const it = DriveApp.getFoldersByName(SHARED_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(SHARED_FOLDER_NAME);
}

function isImage_(f) {
  return /^image\/(png|jpe?g|gif|webp|bmp)$/i.test(f.getMimeType());
}

function thumbOf_(f) {
  try {
    const t = f.getThumbnail();
    if (t) return 'data:' + (t.getContentType() || 'image/png') + ';base64,' + Utilities.base64Encode(t.getBytes());
  } catch (err) {}
  return '';
}

function collect_(folder, groupName, out, count) {
  const items = [];
  const files = folder.getFiles();
  while (files.hasNext() && count.n < SHARED_MAX_FILES) {
    const f = files.next();
    if (!isImage_(f)) continue;
    count.n++;
    items.push({ id: f.getId(), name: f.getName().replace(/\.[^.]+$/, ''), thumb: thumbOf_(f) });
  }
  items.sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
  if (items.length) out.push({ name: groupName, items: items });
}

function listShared_() {
  try {
    const root = sharedRoot_();
    const out = [], count = { n: 0 };
    collect_(root, '선생님 그림', out, count);
    const subs = [];
    const it = root.getFolders();
    while (it.hasNext()) subs.push(it.next());
    subs.sort(function (a, b) { return a.getName().localeCompare(b.getName(), 'ko'); });
    subs.forEach(function (sf) { collect_(sf, sf.getName(), out, count); });
    return reply_({ ok: true, groups: out });
  } catch (err) {
    return reply_({ ok: false, error: String(err) });
  }
}

function sharedImage_(id) {
  try {
    if (!id || !/^[\w-]{10,}$/.test(id)) return reply_({ ok: false, error: '잘못된 요청' });
    const root = sharedRoot_(), rootId = root.getId();
    const f = DriveApp.getFileById(id);
    // 공유 그림 폴더(또는 그 하위 폴더 한 단계) 안의 파일인지 확인
    let inside = false;
    const ps = f.getParents();
    while (ps.hasNext() && !inside) {
      const p = ps.next();
      if (p.getId() === rootId) { inside = true; break; }
      const gp = p.getParents();
      while (gp.hasNext()) if (gp.next().getId() === rootId) { inside = true; break; }
    }
    if (!inside || !isImage_(f)) return reply_({ ok: false, error: '가져올 수 없는 파일이에요.' });
    const b = f.getBlob();
    if (b.getBytes().length > MAX_BYTES) return reply_({ ok: false, error: '그림이 너무 커요.' });
    return reply_({ ok: true, name: f.getName(), data: 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) });
  } catch (err) {
    return reply_({ ok: false, error: '가져올 수 없는 파일이에요.' });
  }
}

/** 편집기에서 한 번 실행: 공유 그림 폴더를 만들고 주소를 알려 줍니다. */
function setupShared() {
  Logger.log('공유 그림 폴더: ' + sharedRoot_().getUrl());
}

/* ===================== v2: 학년·반·번호로 이름 찾기 =====================
 * 명단은 같은 프로젝트의 별도 파일 Roster.gs 에 ROSTER 로 둡니다. (GitHub에는 올리지 않음)
 *   const ROSTER = { '학년-반-번호': '이름', ... };
 * known: 그 학년 명단이 있으면 true → 페이지가 이름칸을 채우거나(없으면 빈칸) 비웁니다.
 *        명단이 없는 학년이면 false → 페이지는 이름칸을 그대로 둡니다.
 */
function lookupName_(cls, num) {
  const roster = (typeof ROSTER !== 'undefined') ? ROSTER : {};
  const m = String(cls || '').match(/^(\d+)-(\d+)$/);
  const n = parseInt(num, 10);
  if (!m || !n) return reply_({ ok: true, known: false, name: '' });
  const grade = m[1] + '-';
  const known = Object.keys(roster).some(function (k) { return k.indexOf(grade) === 0; });
  const name = roster[m[1] + '-' + parseInt(m[2], 10) + '-' + n] || '';
  return reply_({ ok: true, known: known, name: known ? name : '' });
}

/* ===================== v1 ===================== */
function saveV1_(data) {
  try {
    if (data.mimeType !== 'image/png' || !data.fileData) {
      return reply_({ status: 'error', message: 'PNG 이미지만 받을 수 있어요.' });
    }
    const bytes = Utilities.base64Decode(data.fileData);
    if (bytes.length > MAX_BYTES) {
      return reply_({ status: 'error', message: '파일이 너무 커요.' });
    }
    const safeName = safeName_(data.fileName).slice(0, 50) || '스탬프도안';
    const stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'MMdd_HHmmss');
    const fileName = safeName + '_' + stamp + '.png';
    const file = getV1Folder_().createFile(Utilities.newBlob(bytes, 'image/png', fileName));
    return reply_({ status: 'success', fileName: file.getName() });
  } catch (err) {
    return reply_({ status: 'error', message: String(err) });
  }
}

function getV1Folder_() {
  if (FOLDER_ID) return DriveApp.getFolderById(FOLDER_ID);
  const found = DriveApp.getFoldersByName(FOLDER_NAME);
  return found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER_NAME);
}

/* ===================== v2 ===================== */
function saveV2_(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (String(d.image).indexOf('data:image/png;base64,') !== 0) {
      return reply_({ ok: false, error: 'PNG 데이터가 아닙니다.' });
    }
    const bytes = Utilities.base64Decode(d.image.split(',')[1]);
    if (bytes.length > MAX_BYTES) {
      return reply_({ ok: false, error: '파일이 너무 커요.' });
    }
    const cls = safeName_(d.cls) || '학급';
    const num = safeName_(d.num).padStart(2, '0');
    const name = safeName_(d.name) || '이름없음';
    const base = cls + '_' + num + '_' + name;
    const fname = base + '.png';

    const root = getSubFolder_(null, V2_FOLDER_NAME);
    const folder = getSubFolder_(root, cls);          // 반별 폴더 (예: 4-2)
    const existing = folder.getFilesByName(fname);
    if (existing.hasNext()) {
      const old = getSubFolder_(folder, V2_OLD_FOLDER_NAME);
      const stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmmss');
      while (existing.hasNext()) {
        const f = existing.next();
        f.setName(base + '_' + stamp + '.png');
        f.moveTo(old);
      }
    }
    const file = folder.createFile(Utilities.newBlob(bytes, 'image/png', fname));
    getSheet_(root).appendRow([new Date(), cls, num, name, d.top || '', d.bottom || '', fname, file.getUrl()]);
    return reply_({ ok: true, file: fname });
  } catch (err) {
    return reply_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function getSubFolder_(parent, name) {
  const it = parent ? parent.getFoldersByName(name) : DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent ? parent.createFolder(name) : DriveApp.createFolder(name);
}

function getSheet_(folder) {
  const files = folder.getFilesByName(V2_SHEET_NAME);
  let ss;
  if (files.hasNext()) {
    ss = SpreadsheetApp.open(files.next());
  } else {
    ss = SpreadsheetApp.create(V2_SHEET_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    ss.getActiveSheet().appendRow(['제출시각', '학급', '번호', '이름', '위 문구', '아래 문구', '파일명', '링크']);
  }
  return ss.getActiveSheet();
}

/* ===================== 공통 ===================== */
function safeName_(s) {
  return String(s || '').replace(/[\\\/:*?"<>|\r\n]/g, '').trim();
}

function reply_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 편집기에서 한 번 실행: v2 폴더·시트를 미리 만들고 스프레드시트 권한을 승인합니다. */
function setup() {
  const root = getSubFolder_(null, V2_FOLDER_NAME);
  getSheet_(root);
  Logger.log('준비 완료: ' + root.getUrl());
}
