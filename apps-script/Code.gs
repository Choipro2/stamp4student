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
function doGet() {
  return reply_({ ok: true, status: 'ok', message: '스탬프 도안 저장 서버가 동작 중입니다.' });
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
