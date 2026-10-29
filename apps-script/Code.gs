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
  if (data && data.action === 'redraw') return redrawAI_(data);  // v2: AI로 도안 다시 그리기
  if (data && data.image) return saveV2_(data);   // v2 형식
  return saveV1_(data);                            // v1 형식
}

/* ===================== v2: AI 도안 다시 그리기 (OpenAI 이미지 API) =====================
 * 설정: 프로젝트 설정(톱니) → 스크립트 속성
 *   OPENAI_API_KEY  (필수) OpenAI API 키. 코드나 GitHub에는 절대 넣지 마세요.
 *   AI_ENABLED      (선택) false 로 두면 AI 버튼이 꺼집니다.
 *   AI_DAILY_LIMIT  (선택) 하루 최대 사용 횟수. 기본 150
 *   AI_QUALITY      (선택) low / medium / high. 기본 medium (시간 초과가 잦으면 low)
 *   AI_MODEL        (선택) 기본 gpt-image-2
 * 학생 이름·번호는 OpenAI로 보내지 않고, 그림만 보냅니다.
 */
const AI_PROMPT = [
  "Redraw this child's hand drawing as a clean rubber-stamp design.",
  'Keep exactly the same subject, composition and layout, and keep every Korean or English letter exactly as written (same characters, same positions).',
  'Pure black on a pure white background only. Uniform bold strokes about 2.5% of the image width, smooth confident curves, rounded line ends.',
  'Solid black fill only where the original is filled in.',
  'Remove any square or circular frame or border around the drawing, paper texture, shadows, pencil marks, smudges and noise.',
  'No gray, no shading, no gradients, no hatching, no tiny details, do not add anything new.',
  'Center the drawing with a small white margin.'
].join(' ');

function redrawAI_(d) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('OPENAI_API_KEY');
  if (!key) return reply_({ ok: false, error: '선생님이 아직 AI 연결을 설정하지 않았어요.' });
  if (props.getProperty('AI_ENABLED') === 'false') return reply_({ ok: false, error: '지금은 AI 다듬기를 쓸 수 없어요.' });
  if (!d.image || String(d.image).indexOf('data:image/') !== 0) return reply_({ ok: false, error: '그림 데이터가 아닙니다.' });

  // 하루 사용 횟수 제한 (잠금은 숫자 셀 때만 잠깐)
  const limit = Number(props.getProperty('AI_DAILY_LIMIT') || 150);
  const dayKey = 'AI_COUNT_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let used;
  try {
    used = Number(props.getProperty(dayKey) || 0);
    if (used >= limit) return reply_({ ok: false, error: '오늘 AI 사용 횟수를 다 썼어요. 내일 다시 해 보세요.' });
    props.setProperty(dayKey, String(used + 1));
  } finally {
    lock.releaseLock();
  }

  try {
    const parts = String(d.image).split(',');
    const mime = (parts[0].match(/data:(image\/[a-z]+)/) || [])[1] || 'image/png';
    const blob = Utilities.newBlob(Utilities.base64Decode(parts[1]), mime, mime === 'image/png' ? 'drawing.png' : 'drawing.jpg');
    if (blob.getBytes().length > MAX_BYTES) return reply_({ ok: false, error: '그림이 너무 커요.' });

    const res = UrlFetchApp.fetch('https://api.openai.com/v1/images/edits', {
      method: 'post',
      headers: { Authorization: 'Bearer ' + key },
      payload: {
        model: props.getProperty('AI_MODEL') || 'gpt-image-2',
        image: blob,
        prompt: AI_PROMPT,
        size: '1024x1024',
        quality: props.getProperty('AI_QUALITY') || 'medium',
        n: '1'
      },
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    const body = JSON.parse(res.getContentText() || '{}');
    if (code !== 200 || !body.data || !body.data[0] || !body.data[0].b64_json) {
      const msg = (body.error && body.error.message) || ('HTTP ' + code);
      console.error('OpenAI 오류: ' + msg);
      return reply_({ ok: false, error: 'AI가 그림을 만들지 못했어요. (' + msg.slice(0, 120) + ')' });
    }
    return reply_({ ok: true, image: 'data:image/png;base64,' + body.data[0].b64_json, used: used + 1, limit: limit });
  } catch (err) {
    return reply_({ ok: false, error: 'AI 연결 중 문제가 생겼어요. (' + String(err).slice(0, 120) + ')' });
  }
}

/** 편집기에서 실행: OpenAI 연결이 되는지 키만 확인합니다 (그림은 만들지 않아 비용 없음). */
function testAI() {
  const key = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!key) { Logger.log('스크립트 속성에 OPENAI_API_KEY가 없습니다.'); return; }
  const res = UrlFetchApp.fetch('https://api.openai.com/v1/models/gpt-image-2', {
    headers: { Authorization: 'Bearer ' + key }, muteHttpExceptions: true
  });
  Logger.log('응답 코드 ' + res.getResponseCode() + ' : ' + res.getContentText().slice(0, 200));
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
