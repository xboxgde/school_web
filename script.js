// ============================================================
// 1. Supabase 연결 설정 (본인 값으로 교체하세요)
// ============================================================
const SUPABASE_URL = "https://pferecgjagtxoxkxtqdi.supabase.co"; // ← 본인 값으로 교체
const SUPABASE_ANON_KEY = "sb_publishable_PnFjiCMOP0puu9lxUED46Q_AXwq4NV5";            // ← 본인 값으로 교체
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// [추가] 사진을 저장하는 Storage 버킷 이름 (README의 SQL과 동일해야 함)
const BUCKET = "gift-photos";
// [추가] 선물 메시지가 비어 있을 때 보여줄 기본 문구
const DEFAULT_GIFT_MESSAGE = "생일을 진심으로 축하해요! 🎉";

// ============================================================
// 2. 화면 전환 관리
// ============================================================
// [수정] "not-found" 추가
const SCREENS = ["welcome", "input", "confirm", "not-found", "celebrate", "admin-login", "admin"];

function show(name) {
  SCREENS.forEach((s) => {
    document.getElementById(`screen-${s}`).hidden = s !== name;
  });
  window.scrollTo(0, 0);
}

// data-go="화면이름" 버튼 → 해당 화면으로 이동 (이벤트 위임)
document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-go]");
  if (target) show(target.dataset.go);
});

// ============================================================
// 3. 공통 유틸
// ============================================================
const $ = (id) => document.getElementById(id);

function fillDateSelects(monthSel, daySel) {
  for (let m = 1; m <= 12; m++) monthSel.add(new Option(m, m));
  for (let d = 1; d <= 31; d++) daySel.add(new Option(d, d));
}
fillDateSelects($("bd-month"), $("bd-day"));
fillDateSelects($("admin-month"), $("admin-day"));

// [추가] 저장된 사진 경로 → 브라우저에서 볼 수 있는 공개 주소로 변환
function photoUrl(path) {
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// [추가] 파일명 중복/추측 방지용 랜덤 ID
function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random().toString(36).slice(2);
}

// [추가] 사진 축소 + JPEG 변환
// 폰 사진은 용량이 커서(5MB 이상) 업로드가 실패할 수 있으므로 긴 변 1600px 이하로 줄인다.
async function resizeImage(file, maxSize = 1600) {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일이 아닙니다.");
  const bitmap = await createImageBitmap(file); // 사진 회전 정보(EXIF)를 자동 반영
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";                       // 투명 PNG의 배경이 검게 변하지 않도록 흰색 채움
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("변환 실패"))), "image/jpeg", 0.85)
  );
}

// ============================================================
// 4. 환영 → 생일 입력 → (확인) → 축하 흐름
// ============================================================
$("welcome-btn").addEventListener("click", () => show("input"));

$("birthday-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const month = Number($("bd-month").value);
  const day = Number($("bd-day").value);
  const status = $("input-status");
  status.textContent = "확인 중…";

  const { data, error } = await db.rpc("find_birthday", { p_month: month, p_day: day });

  if (error) {
    console.error(error);
    status.textContent = "조회에 실패했어요. 잠시 후 다시 시도해 주세요.";
    return;
  }
  status.textContent = "";

  if (data.length > 0) {
    renderConfirm(data, month, day);
    show("confirm");
  } else {
  // 등록자가 없으면 미등록 안내 화면을 보여준다
  $("notfound-text").textContent = `${month}월 ${day}일은 등록되어 있지 않아요.`;
  show("not-found");
}
});

function renderConfirm(people, month, day) {
  const ul = $("confirm-list");
  ul.replaceChildren();
  people.forEach((p) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${p.name}입니다`;
    // [수정] 기존: startCelebration(p.name, month, day)
    //        → 선물 조회를 위해 생일자 id(p.id)도 함께 전달
    btn.addEventListener("click", () => startCelebration(p.name, month, day, p.id));
    li.append(btn);
    ul.append(li);
  });
}

$("confirm-no").addEventListener("click", () => show("input"));

// [수정] 축하 화면 시작: 기존엔 이름/날짜만 표시 → 이제 선물 내용(메시지/사진)도 불러온다
async function startCelebration(name, month, day, personId = null) {
  resetGift(); // 이전에 열었던 상태 초기화

  $("hero-title").textContent = name ? `${name}님, 생일 축하해요!` : "생일 축하해요!";
  $("hero-date").textContent = `${month}월 ${day}일`;

  // 기본값: 등록된 선물이 없을 때 보여줄 내용
  let message = DEFAULT_GIFT_MESSAGE;
  let imageUrl = null;

  // 등록된 생일자라면 DB 함수로 선물(메시지/사진 경로) 조회
  if (personId !== null) {
    const { data, error } = await db.rpc("get_gift", { p_id: personId });
    if (error) {
      console.error(error); // 실패해도 기본 선물로 진행
    } else if (data && data.length > 0) {
      const gift = data[0];
      if (gift.gift_message) message = gift.gift_message;
      if (gift.gift_photo_path) imageUrl = photoUrl(gift.gift_photo_path);
    }
  }

  // 내용은 미리 채워두고, 상자를 열 때 보여준다
  $("gift-message").textContent = message; // textContent: XSS 방지
  const img = $("gift-photo");
  if (imageUrl) {
    img.src = imageUrl;
    img.hidden = false;
  } else {
    img.hidden = true;
    img.removeAttribute("src");
  }

  show("celebrate");
}

// ============================================================
// 5. [추가] 선물상자 열기
// ============================================================
const giftBox = $("gift-box");
let giftTimer = null; // 열림 연출 타이머 (화면을 벗어날 때 취소하기 위해 보관)
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// 선물상자를 처음 상태로 되돌림
function resetGift() {
  clearTimeout(giftTimer); // 이전 연출이 남아 있으면 취소
  giftBox.classList.remove("is-open");
  giftBox.hidden = false;
  $("gift-content").hidden = true;
  $("gift-hint").hidden = false;
}

giftBox.addEventListener("click", () => {
  if (giftBox.classList.contains("is-open")) return; // 중복 클릭 방지
  giftBox.classList.add("is-open"); // CSS가 뚜껑 열림 연출 실행
  $("gift-hint").hidden = true;

  // 연출이 끝난 뒤(0.9초) 상자를 숨기고 내용 카드를 같은 자리에 표시
  const delay = prefersReducedMotion.matches ? 0 : 900;
  giftTimer = setTimeout(() => {
    giftBox.hidden = true;
    $("gift-content").hidden = false;
  }, delay);
});

// [삭제] 기존 5. 축하 메시지(방명록) 기능 전체 (loadMessages, createMessageItem, 메시지 폼 제출)
//        → 새 축하 화면(선물상자)으로 대체됨. DB의 messages 테이블은 그대로 남아 있음.

// ============================================================
// 6. 개발자(관리자) 기능
// ============================================================

$("admin-btn").addEventListener("click", async () => {
  const { data } = await db.auth.getSession();
  if (data.session) {
    await openAdmin();
  } else {
    show("admin-login");
  }
});

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

$("logout-btn").addEventListener("click", async () => {
  await db.auth.signOut();
  show("welcome");
});

async function openAdmin() {
  resetAdminForm();
  await loadAdminList();
  show("admin");
}

// 6-1. 등록된 생일 목록
async function loadAdminList() {
  const ul = $("admin-list");
  // [수정] 기존 select: "id, name, birth_month, birth_day"
  //        → 선물 메시지/사진 경로 컬럼 추가
  const { data, error } = await db
    .from("birthdays")
    .select("id, name, birth_month, birth_day, gift_message, gift_photo_path")
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

    // 왼쪽: 날짜 · 이름 + 선물 등록 현황
    const info = document.createElement("span");
    info.textContent = `${row.birth_month}월 ${row.birth_day}일 · ${row.name}`;
    const tag = document.createElement("span");
    tag.className = "admin-item__tag";
    const tags = [row.gift_message ? "메시지" : null, row.gift_photo_path ? "사진" : null].filter(Boolean);
    tag.textContent = tags.length ? ` (${tags.join("·")})` : " (선물 없음)";
    info.append(tag);

    // 오른쪽: 수정 / 삭제 버튼
    const actions = document.createElement("span");
    actions.className = "admin-item__actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "수정";
    editBtn.addEventListener("click", () => startEdit(row));

    // [추가] 생일자 삭제 버튼
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "danger";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => deleteBirthday(row));

    actions.append(editBtn, delBtn);
    li.append(info, actions);
    ul.append(li);
  });
}

// 6-2. 사진 상태 관리 (미리보기)
let currentPhotoPath = null; // 수정 중인 생일자의 "저장된" 사진 경로
let previewObjectUrl = null; // 새로 고른 파일의 임시 미리보기 주소 (메모리 해제용)

// 사진 영역 갱신: 새로 고른 파일 > 저장된 사진 > 없음 순으로 표시
function refreshPhotoBox() {
  const img = $("admin-photo-preview");
  const file = $("admin-photo").files[0];

  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl); // 이전 임시 주소 해제
    previewObjectUrl = null;
  }

  if (file) {
    previewObjectUrl = URL.createObjectURL(file);
    img.src = previewObjectUrl;
  } else if (currentPhotoPath) {
    img.src = photoUrl(currentPhotoPath);
  } else {
    $("admin-photo-box").hidden = true;
    img.removeAttribute("src");
    return;
  }
  $("admin-photo-box").hidden = false;
  // 파일만 골라둔 상태면 "선택 취소", 저장된 사진이면 "사진 삭제"
  $("admin-del-photo").textContent = file ? "선택 취소" : "사진 삭제";
}
$("admin-photo").addEventListener("change", refreshPhotoBox);

// 6-3. 수정 모드 진입
// [수정] 기존: 이름/월/일만 채움 → 선물 메시지/사진도 채움
function startEdit(row) {
  $("admin-edit-id").value = row.id;
  $("admin-name").value = row.name;
  $("admin-month").value = row.birth_month;
  $("admin-day").value = row.birth_day;
  $("admin-gift-msg").value = row.gift_message ?? "";
  $("admin-photo").value = ""; // 파일 선택 초기화
  currentPhotoPath = row.gift_photo_path;
  refreshPhotoBox();
  $("admin-del-msg").hidden = !row.gift_message; // 저장된 메시지가 있을 때만 삭제 버튼 표시
  $("admin-save").textContent = "수정 저장";
  $("admin-cancel").hidden = false;
  $("admin-status").textContent = "";
  $("admin-form").scrollIntoView({ behavior: "smooth", block: "center" }); // 목록이 아래라서 폼으로 이동
  $("admin-name").focus();
}

// 6-4. 폼 초기화
// [수정] 기존: 폼 reset + 버튼 문구만 복원 → 사진/메시지 삭제 버튼 상태도 함께 초기화
function resetAdminForm() {
  $("admin-form").reset(); // 입력값 + 파일 선택까지 초기화
  $("admin-edit-id").value = "";
  currentPhotoPath = null;
  refreshPhotoBox();
  $("admin-del-msg").hidden = true;
  $("admin-save").textContent = "등록";
  $("admin-cancel").hidden = true;
  $("admin-status").textContent = "";
}
$("admin-cancel").addEventListener("click", resetAdminForm);

// 6-5. 저장 (등록/수정)
// [수정] 기존: name/month/day만 저장 → 선물 메시지 + 사진 업로드까지 처리
$("admin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("admin-status");
  const saveBtn = $("admin-save");
  const editId = $("admin-edit-id").value;
  const file = $("admin-photo").files[0];
  const oldPhotoPath = currentPhotoPath; // 사진 교체 시 지울 이전 파일

  saveBtn.disabled = true; // 중복 전송 방지

  const payload = {
    name: $("admin-name").value.trim(),
    birth_month: Number($("admin-month").value),
    birth_day: Number($("admin-day").value),
    gift_message: $("admin-gift-msg").value.trim() || null, // 비우고 저장하면 메시지 삭제
  };

  // (1) 새 사진이 있으면 먼저 Storage에 업로드
  let newPhotoPath = null;
  if (file) {
    try {
      status.textContent = "사진 올리는 중…";
      const blob = await resizeImage(file);
      newPhotoPath = `${uid()}.jpg`;
      const { error: upErr } = await db.storage
        .from(BUCKET)
        .upload(newPhotoPath, blob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      payload.gift_photo_path = newPhotoPath; // 새 경로만 DB에 기록
    } catch (err) {
      console.error(err);
      status.textContent = "사진 업로드에 실패했어요. 이미지 파일(JPG/PNG 등)인지 확인해 주세요.";
      saveBtn.disabled = false;
      return;
    }
  }

  // (2) DB 저장: edit-id가 있으면 UPDATE, 없으면 INSERT
  status.textContent = "저장 중…";
  const query = editId
    ? db.from("birthdays").update(payload).eq("id", editId)
    : db.from("birthdays").insert(payload);
  const { error } = await query;

  if (error) {
    console.error(error);
    // DB 저장이 실패하면 방금 올린 사진은 쓸모없으므로 정리
    if (newPhotoPath) await db.storage.from(BUCKET).remove([newPhotoPath]);
    status.textContent = "저장에 실패했어요. 로그인 상태와 입력값을 확인해 주세요.";
    saveBtn.disabled = false;
    return;
  }

  // (3) 사진을 교체했다면 이전 파일 삭제 (저장 성공 후에만)
  if (newPhotoPath && oldPhotoPath) {
    await db.storage.from(BUCKET).remove([oldPhotoPath]);
  }

  resetAdminForm();
  $("admin-status").textContent = editId ? "수정했어요." : "등록했어요.";
  saveBtn.disabled = false;
  await loadAdminList();
});

// 6-6. [추가] 선물 메시지만 삭제
$("admin-del-msg").addEventListener("click", async () => {
  const id = $("admin-edit-id").value;
  if (!id) return;
  if (!confirm("저장된 선물 메시지를 삭제할까요?")) return;

  const { error } = await db.from("birthdays").update({ gift_message: null }).eq("id", id);
  if (error) {
    console.error(error);
    $("admin-status").textContent = "메시지 삭제에 실패했어요.";
    return;
  }
  $("admin-gift-msg").value = "";
  $("admin-del-msg").hidden = true;
  $("admin-status").textContent = "메시지를 삭제했어요.";
  await loadAdminList();
});

// 6-7. [추가] 사진 삭제 (또는 새로 고른 파일 선택 취소)
$("admin-del-photo").addEventListener("click", async () => {
  // 새로 고른 파일만 있는 상태 → 저장된 사진은 건드리지 않고 선택만 취소
  if ($("admin-photo").files.length > 0) {
    $("admin-photo").value = "";
    refreshPhotoBox();
    return;
  }

  // 저장된 사진 삭제
  const id = $("admin-edit-id").value;
  if (!id || !currentPhotoPath) return;
  if (!confirm("저장된 사진을 삭제할까요?")) return;

  // DB 기록을 먼저 지우고, 그다음 Storage 파일 삭제 (순서가 반대면 깨진 링크가 남을 수 있음)
  const { error } = await db.from("birthdays").update({ gift_photo_path: null }).eq("id", id);
  if (error) {
    console.error(error);
    $("admin-status").textContent = "사진 삭제에 실패했어요.";
    return;
  }
  await db.storage.from(BUCKET).remove([currentPhotoPath]);
  currentPhotoPath = null;
  refreshPhotoBox();
  $("admin-status").textContent = "사진을 삭제했어요.";
  await loadAdminList();
});

// 6-8. [추가] 생일자 삭제 (메시지/사진 포함)
async function deleteBirthday(row) {
  if (!confirm(`'${row.name}' 님의 생일 정보를 삭제할까요?\n선물 메시지와 사진도 함께 삭제됩니다.`)) return;

  // DB 행을 먼저 삭제 (실패하면 사진은 그대로 보존)
  const { error } = await db.from("birthdays").delete().eq("id", row.id);
  if (error) {
    console.error(error);
    $("admin-status").textContent = "삭제에 실패했어요.";
    return;
  }
  // 행 삭제 성공 후 사진 파일 정리
  if (row.gift_photo_path) {
    await db.storage.from(BUCKET).remove([row.gift_photo_path]);
  }
  // 방금 삭제한 사람을 수정 중이었다면 폼도 초기화
  if ($("admin-edit-id").value === String(row.id)) resetAdminForm();
  $("admin-status").textContent = "삭제했어요.";
  await loadAdminList();
}

// ============================================================
// 7. 시작 화면
// ============================================================
show("welcome");
