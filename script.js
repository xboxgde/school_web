// ============================================================
// 1. Supabase 연결 설정
// ============================================================
// Supabase 대시보드 > Project Settings > API 에서 확인할 수 있다.
// anon(public) 키는 브라우저에 노출되는 키이므로 GitHub에 올려도 된다.
// 단, 반드시 테이블에 RLS(행 수준 보안) 정책을 걸어야 안전하다. (README 참고)
const SUPABASE_URL = "https://pferecgjagtxoxkxtqdi.supabase.co"; // ← 본인 값으로 교체
const SUPABASE_ANON_KEY = "sb_publishable_PnFjiCMOP0puu9lxUED46Q_AXwq4NV5";            // ← 본인 값으로 교체

// CDN으로 불러온 전역 객체 supabase에서 클라이언트를 생성
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// 2. 자주 쓰는 DOM 요소 모아두기
// ============================================================
const form = document.getElementById("message-form");
const list = document.getElementById("message-list");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submit-btn");

// ============================================================
// 3. 유틸 함수
// ============================================================

// 사용자 입력을 화면에 넣을 때 HTML로 해석되지 않도록 처리 (XSS 방지)
// innerHTML 대신 textContent를 쓰면 자동으로 안전하다.
function createMessageItem(msg) {
  const li = document.createElement("li");

  const name = document.createElement("span");
  name.className = "messages__name";
  name.textContent = msg.name; // textContent: 문자열 그대로 출력

  const time = document.createElement("span");
  time.className = "messages__time";
  time.textContent = new Date(msg.created_at).toLocaleString("ko-KR");

  const text = document.createElement("p");
  text.className = "messages__text";
  text.textContent = msg.content;

  li.append(name, time, text);
  return li;
}

// ============================================================
// 4. 메시지 목록 불러오기 (SELECT)
// ============================================================
async function loadMessages() {
  const { data, error } = await db
    .from("messages")                          // messages 테이블
    .select("id, name, content, created_at")   // 필요한 컬럼만 조회
    .order("created_at", { ascending: false }) // 최신순
    .limit(100);                               // 최대 100개

  list.replaceChildren(); // 기존 목록 비우기

  if (error) {
    console.error(error);
    list.innerHTML = '<li class="messages__empty">메시지를 불러오지 못했어요. 설정을 확인해 주세요.</li>';
    return;
  }
  if (data.length === 0) {
    list.innerHTML = '<li class="messages__empty">첫 번째 축하 메시지를 남겨보세요!</li>';
    return;
  }
  data.forEach((msg) => list.append(createMessageItem(msg)));
}

// ============================================================
// 5. 메시지 저장하기 (INSERT)
// ============================================================
form.addEventListener("submit", async (e) => {
  e.preventDefault(); // 폼 기본 동작(페이지 새로고침) 막기

  const name = form.name.value.trim();
  const content = form.content.value.trim();
  if (!name || !content) return;

  submitBtn.disabled = true; // 중복 전송 방지
  statusEl.textContent = "보내는 중…";

  const { error } = await db.from("messages").insert({ name, content });

  if (error) {
    console.error(error);
    statusEl.textContent = "전송에 실패했어요. 잠시 후 다시 시도해 주세요.";
  } else {
    statusEl.textContent = "메시지가 전달되었어요! 🎉";
    form.reset();
    await loadMessages(); // 목록 새로고침
  }
  submitBtn.disabled = false;
});

// ============================================================
// 6. 페이지가 열리면 바로 목록 불러오기
// ============================================================
loadMessages();
