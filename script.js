// ============================================================
// 1. Supabase 연결 설정 (기존 값 그대로 유지하세요)
// ============================================================
const SUPABASE_URL = "https://pferecgjagtxoxkxtqdi.supabase.co"; // ← 본인 값으로 교체
const SUPABASE_ANON_KEY = "sb_publishable_PnFjiCMOP0puu9lxUED46Q_AXwq4NV5";            // ← 본인 값으로 교체
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// 2. [추가] 화면 전환 관리
// ============================================================
// index.html 의 id="screen-XXX" 와 이름이 일치해야 한다.
const SCREENS = ["welcome", "input", "confirm", "celebrate", "admin-login", "admin"];

// 지정한 화면만 보이게 하고 나머지는 숨긴다
function show(name) {
  SCREENS.forEach((s) => {
    document.getElementById(`screen-${s}`).hidden = s !== name;
  });
  window.scrollTo(0, 0);
}

// data-go="화면이름" 이 붙은 버튼은 클릭 시 해당 화면으로 이동 (이벤트 위임)
document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-go]");
  if (target) show(target.dataset.go);
});

// ============================================================
// 3. [추가] 공통 유틸
// ============================================================
const $ = (id) => document.getElementById(id); // 짧게 쓰기 위한 헬퍼

// 월(1~12), 일(1~31) select 옵션 채우기
function fillDateSelects(monthSel, daySel) {
  for (let m = 1; m <= 12; m++) monthSel.add(new Option(m, m));
  for (let d = 1; d <= 31; d++) daySel.add(new Option(d, d));
}
fillDateSelects($("bd-month"), $("bd-day"));
fillDateSelects($("admin-month"), $("admin-day"));

// ============================================================
// 4. [추가] 환영 → 생일 입력 → (확인) → 축하 흐름
// ============================================================

// 4-1. 환영합니다! 버튼 → 생일 입력 화면
$("welcome-btn").addEventListener("click", () => show("input"));

// 4-2. 생일 제출 → DB에서 동일 생일자 조회
$("birthday-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const month = Number($("bd-month").value);
  const day = Number($("bd-day").value);
  const status = $("input-status");
  status.textContent = "확인 중…";

  // DB 함수(find_birthday)를 호출. 이름만 돌려받는다 (README의 SQL 참고)
  const { data, error } = await db.rpc("find_birthday", { p_month: month, p_day: day });

  if (error) {
    console.error(error);
    status.textContent = "조회에 실패했어요. 잠시 후 다시 시도해 주세요.";
    return;
  }
  status.textContent = "";

  if (data.length > 0) {
    renderConfirm(data, month, day); // 동일 생일자 있음 → 확인 화면
    show("confirm");
  } else {
    startCelebration(null, month, day); // 없음 → 바로 축하 화면
  }
});

// 4-3. 확인 화면: 일치하는 사람 목록을 버튼으로 표시
function renderConfirm(people, month, day) {
  const ul = $("confirm-list");
  ul.replaceChildren();
  people.forEach((p) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${p.name}입니다`; // textContent: XSS 방지
    btn.addEventListener("click", () => startCelebration(p.name, month, day));
    li.append(btn);
    ul.append(li);
  });
}

// 4-4. "아니에요" → 다시 생일 입력 화면
$("confirm-no").addEventListener("click", () => show("input"));

// 4-5. 축하 화면 시작: 이름(없으면 null)과 날짜 표시
function startCelebration(name, month, day) {
  $("hero-sub").textContent = name ? `To. ${name}` : "";
  $("hero-title").textContent = name ? `${name}님, 생일 축하해요!` : "생일 축하해요!";
  $("hero-date").textContent = `${month}월 ${day}일`;
  show("celebrate");
  loadMessages();
}

// ============================================================
// 5. 축하 메시지 (기존 기능 유지)
// ============================================================
const form = $("message-form");
const list = $("message-list");
const statusEl = $("status");
const submitBtn = $("submit-btn");

function createMessageItem(msg) {
  const li = document.createElement("li");
  const name = document.createElement("span");
  name.className = "messages__name";
  name.textContent = msg.name;
  const time = document.createElement("span");
  time.className = "messages__time";
  time.textContent = new Date(msg.created_at).toLocaleString("ko-KR");
  const text = document.createElement("p");
  text.className = "messages__text";
  text.textContent = msg.content;
  li.append(name, time, text);
  return li;
}

async function loadMessages() {
  const { data, error } = await db
    .from("messages")
    .select("id, name, content, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  list.replaceChildren();
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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = form.name.value.trim();
  const content = form.content.value.trim();
  if (!name || !content) return;

  submitBtn.disabled = true;
  statusEl.textContent = "보내는 중…";
  const { error } = await db.from("messages").insert({ name, content });

  if (error) {
    console.error(error);
    statusEl.textContent = "전송에 실패했어요. 잠시 후 다시 시도해 주세요.";
  } else {
    statusEl.textContent = "메시지가 전달되었어요! 🎉";
    form.reset();
    await loadMessages();
  }
  submitBtn.disabled = false;
});

// [수정] 기존: 페이지 로드 시 loadMessages() 즉시 호출
//        → 삭제함. 이제 축하 화면에 진입할 때(startCelebration) 호출한다.

// ============================================================
// 6. [추가] 개발자(관리자) 기능
// ============================================================

// 6-1. 개발자 버튼: 이미 로그인된 세션이 있으면 바로 관리 화면, 없으면 로그인 화면
$("admin-btn").addEventListener("click", async () => {
  const { data } = await db.auth.getSession();
  if (data.session) {
    await openAdmin();
  } else {
    show("admin-login");
  }
});

// 6-2. 로그인: Supabase Auth 의 이메일/비밀번호 로그인 사용
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("login-status");
  status.textContent = "로그인 중…";

  const { error } = await db.auth.signInWithPassword({
    email: $("admin-id").value.trim(),
    password: $("admin-pw").value,
  });

  if (error) {
    console.error(error);
    status.textContent = "ID 또는 Password가 올바르지 않아요.";
    return;
  }
  status.textContent = "";
  $("login-form").reset();
  await openAdmin();
});

// 6-3. 로그아웃
$("logout-btn").addEventListener("click", async () => {
  await db.auth.signOut();
  show("welcome");
});

// 6-4. 관리 화면 열기 (목록 불러온 뒤 표시)
async function openAdmin() {
  resetAdminForm();
  await loadAdminList();
  show("admin");
}

// 6-5. 등록된 생일 목록 불러오기 (로그인 상태에서만 RLS가 허용)
async function loadAdminList() {
  const ul = $("admin-list");
  const { data, error } = await db
    .from("birthdays")
    .select("id, name, birth_month, birth_day")
    .order("birth_month")
    .order("birth_day");

  ul.replaceChildren();
  if (error) {
    console.error(error);
    ul.innerHTML = '<li class="messages__empty">목록을 불러오지 못했어요.</li>';
    return;
  }
  if (data.length === 0) {
    ul.innerHTML = '<li class="messages__empty">등록된 생일이 없어요.</li>';
    return;
  }
  data.forEach((row) => {
    const li = document.createElement("li");
    li.className = "admin-item";

    const info = document.createElement("span");
    info.textContent = `${row.birth_month}월 ${row.birth_day}일 · ${row.name}`;

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "수정";
    editBtn.addEventListener("click", () => startEdit(row)); // 클릭 시 폼에 값 채우기

    li.append(info, editBtn);
    ul.append(li);
  });
}

// 6-6. 수정 모드 진입: 폼에 기존 값 채우기
function startEdit(row) {
  $("admin-edit-id").value = row.id;
  $("admin-name").value = row.name;
  $("admin-month").value = row.birth_month;
  $("admin-day").value = row.birth_day;
  $("admin-save").textContent = "수정 저장";
  $("admin-cancel").hidden = false;
  $("admin-name").focus();
}

// 6-7. 폼 초기화 (등록 모드로 복귀)
function resetAdminForm() {
  $("admin-form").reset();
  $("admin-edit-id").value = "";
  $("admin-save").textContent = "등록";
  $("admin-cancel").hidden = true;
  $("admin-status").textContent = "";
}
$("admin-cancel").addEventListener("click", resetAdminForm);

// 6-8. 등록/수정 저장: edit-id가 있으면 UPDATE, 없으면 INSERT
$("admin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("admin-status");
  const editId = $("admin-edit-id").value;
  const payload = {
    name: $("admin-name").value.trim(),
    birth_month: Number($("admin-month").value),
    birth_day: Number($("admin-day").value),
  };

  const query = editId
    ? db.from("birthdays").update(payload).eq("id", editId) // 수정
    : db.from("birthdays").insert(payload);                 // 등록
  const { error } = await query;

  if (error) {
    console.error(error);
    status.textContent = "저장에 실패했어요. 로그인 상태와 입력값을 확인해 주세요.";
    return;
  }
  resetAdminForm();
  $("admin-status").textContent = editId ? "수정했어요." : "등록했어요.";
  await loadAdminList();
});

// ============================================================
// 7. [추가] 시작 화면
// ============================================================
show("welcome");
