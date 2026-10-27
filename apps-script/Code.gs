/**
 * 스탬프 도안 생성기 → 내 구글 드라이브 저장용 앱스스크립트
 *
 * 학생이 '드라이브로 보내기'를 누르면 PNG 이미지가
 * 내 드라이브의 「스탬프 도안」 폴더에 저장됩니다. (폴더가 없으면 자동으로 만듭니다)
 *
 * 특정 폴더에 받고 싶으면 그 폴더 주소(drive.google.com/drive/folders/여기부분)의
 * 마지막 부분을 아래 FOLDER_ID에 넣으세요. 비워 두면 「스탬프 도안」 폴더를 씁니다.
 */
const FOLDER_ID = '';
const FOLDER_NAME = '스탬프 도안';
const MAX_BYTES = 10 * 1024 * 1024; // 10MB 넘는 파일은 받지 않음

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.mimeType !== 'image/png' || !data.fileData) {
      return reply_({ status: 'error', message: 'PNG 이미지만 받을 수 있어요.' });
    }

    const bytes = Utilities.base64Decode(data.fileData);
    if (bytes.length > MAX_BYTES) {
      return reply_({ status: 'error', message: '파일이 너무 커요.' });
    }

    // 파일 이름 정리 + 같은 이름이 겹치지 않도록 시각을 붙임
    const safeName = String(data.fileName || '스탬프도안')
      .replace(/[\\/:*?"<>|]/g, '')
      .trim()
      .slice(0, 50) || '스탬프도안';
    const stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'MMdd_HHmmss');
    const fileName = safeName + '_' + stamp + '.png';

    const blob = Utilities.newBlob(bytes, 'image/png', fileName);
    const file = getFolder_().createFile(blob);

    return reply_({ status: 'success', fileName: file.getName() });
  } catch (err) {
    return reply_({ status: 'error', message: String(err) });
  }
}

// 주소를 브라우저로 열었을 때 연결 확인용
function doGet() {
  return reply_({ status: 'ok', message: '스탬프 도안 저장 서버가 동작 중입니다.' });
}

function getFolder_() {
  if (FOLDER_ID) return DriveApp.getFolderById(FOLDER_ID);
  const found = DriveApp.getFoldersByName(FOLDER_NAME);
  return found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER_NAME);
}

function reply_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
