# TASK: Fix lỗi reliability + UX cho module Open Sesame
_Created: 2026-06-05 · Status: in-progress (Đợt 1 done; P1/P2 pending)_

## Request
Sau khi review module Open Sesame: liệt kê các lỗi đã tìm thấy + hướng fix, gom thành một plan để duyệt trước khi sửa code.

## Request analysis
- Intent: fix-bug (gom nhiều fix)
- Modules involved: 03 Open Sesame (backend + frontend). Không ảnh hưởng module khác (đã verify: chỉ `lib.rs` host + `tauri.ts` của module tham chiếu `plugin:open-sesame`).

## Current flow (tóm tắt vùng liên quan)
- Sync: `commands/sync.rs` → `services/sync_service.rs` → `providers/git_provider.rs` (git2). Status doc-set: `idle/syncing/error...` trong SQLite.
- Mapping/mirror: `services/doc_set_manifest_service/{transfer,preflight,storage}.rs` + `services/mirror_service.rs` (copy mtime-based, exclude top-level).
- Watcher: `commands/doc_set.rs::build_doc_set_watcher()` (notify → `fs:change`).
- DB: 1 `Connection` sau 1 `tokio::Mutex` cho cả plugin.

## Findings / Root cause / Gap
Mỗi lỗi dưới đây đã đọc & verify trực tiếp trên code (không suy từ doc/tên hàm).

| ID | Severity | Lỗi | Root cause (file:line) |
|----|----|----|----|
| P0-1 | 🔴 HIGH | Crash giữa lúc sync → doc-set kẹt `syncing` vĩnh viễn, không phục hồi trong app | `lib.rs:71-86` init không reset status; `sync_service.rs:45/133/243` chặn khi `syncing`; `clear_error_status` chỉ reset `error` (`doc_set.rs:298`) |
| P0-2 | 🔴 HIGH | `sync_down`/restore có thể xóa nguyên folder local đã map (mất dữ liệu) | `transfer.rs:96-98` gọi `remove_local_path` → `fs::remove_dir_all` không xác nhận khi source mirror không tồn tại |
| P1-1 | 🟠 MED | Sibling-exclusion sai với nested mirror source (nhiều cấp) → ghi đè/nhân đôi | `mirror_service.rs:110/166` chỉ exclude tên top-level 1 cấp; `normalize_mirror_path` (`storage.rs:175`) lại cho phép path nhiều cấp |
| P1-2 | 🟠 MED | "Debounce" watcher thực ra là throttle bỏ event đuôi → cây file FE stale | `doc_set.rs:491-495` `return` khi <450ms, không emit trailing |
| P1-3 | 🟠 MED | Không phát hiện "remote đi trước" → user không biết khi nào cần pull | `sync.rs:66-86` + `git_provider.rs:246` chỉ xét working-tree local, không fetch so remote |
| P1-4 | 🟠 MED | `sync_up` bỏ qua edit local mới nếu mirror đang "bẩn" (sau 1 lần sync lỗi) | `sync_service.rs:326-328` chỉ copy local→mirror khi status == UpToDate |
| P1-5 | 🟠 MED | Giữ DB Mutex xuyên suốt I/O filesystem nặng → UI khựng | `doc_set.rs:50/162/198/211/223` lock DB rồi mới copy hàng loạt file |
| P1-6 | 🟠 MED | Ghi manifest/mapping không atomic → crash giữa lúc ghi làm hỏng JSON | `storage.rs:30,55` `fs::write` trực tiếp |
| P2-1 | 🟡 LOW | Phân loại lỗi sync bằng substring, bỏ phí `error_kind()` có sẵn | `sync_service.rs:457-528` |
| P2-2 | 🟡 LOW | Hash đọc cả file vào RAM (OOM file lớn) | `file_compare.rs:128-133` `fs::read` |
| P2-3 | 🟡 LOW | Commit timestamp hardcode UTC+7 | `git_provider.rs:57-59` |
| P2-4 | 🟡 LOW | Keyring rác nếu insert account fail sau khi lưu token | `auth.rs:32-48` |
| UX-1 | 🟡 LOW | Auto-sync tự tắt im lặng khi lỗi (không báo lý do) | `sync-controls.tsx:77` |
| UX-2 | 🟡 LOW | Lỗi search chỉ `console.error`, không hiện cho user | `search-bar.tsx` (FE review) |
| UX-3 | 🟡 LOW | Login device-flow thiếu nút copy mã | `login-screen.tsx` (FE review) |

> Đã **loại** 1 claim sai của sub-agent: "git_guard có thể xóa tracked file" — verify lại `git_guard.rs:9-46`: git2 `statuses()` không trả file tracked-clean nên guard reject đúng. Không đưa vào plan.

## Coverage (proof this is complete)
- Đã đọc trực tiếp: `sync_service.rs`, `git_provider.rs`, `mirror_service.rs`, `transfer.rs`, `preflight.rs`, `file_compare.rs`, `git_guard.rs`, `storage.rs`, `commands/{sync,doc_set,auth}.rs`, `factory.rs`, `error.rs`, `lib.rs`.
- Grep xác nhận negative: chỉ `sync_service` set/đọc `syncing`, không có path reset `syncing` ngoài op đang chạy → P0-1 đúng.
- Grep xác nhận `keep_both` rồi gọi `restore_local_from_mirror` (`source-mapping-modal.tsx:294-302`); `auto_sync` chỉ là flag + timer FE.
- Cross-module: chỉ host + tauri.ts tham chiếu plugin → blast radius gói gọn trong module.
- Unverified assumptions: P1-4 (gate `if UpToDate` có thể cố ý cho 1 lý do edge nào đó — cần test kỹ first-push khi gỡ gate); P1-3 (chi phí thêm network call cho status — sẽ tách command riêng).

## Plan — checklist (đây là hợp đồng; sẽ không tự ý lệch)

### Đợt 1 — P0 (bắt buộc, làm trước)
| # | Action (file → change) | Verify | Status |
|---|---|---|---|
| 1 | `db/doc_set_repo.rs`: thêm `reset_syncing_to_idle(conn)` (UPDATE status='idle' WHERE status='syncing'). Gọi trong `lib.rs::init()` sau `run_migrations`. | Unit test: insert doc-set status=syncing → gọi reset → assert idle. Manual: kill app khi đang sync, mở lại, sync chạy được. | ✅ done |
| 2 | `transfer.rs:96-98`: bỏ auto `remove_local_path` khi source mirror mất; thay bằng skip + trả 0 (không xóa folder local). Việc xóa file lẻ thừa vẫn do `remove_orphaned` xử lý khi source tồn tại. | Unit test: mirror sub-source không tồn tại → local folder được giữ nguyên, copied=0. | ✅ done |

### Đợt 2 — P1 (nên làm)
| # | Action (file → change) | Verify | Status |
|---|---|---|---|
| 3 | `mirror_service.rs`: exclude theo **đường dẫn tương đối đầy đủ** (so prefix), không theo tên 1 cấp; thread relative-path qua `copy_dir_recursive`/`remove_orphaned`. | Unit test: root `.` + nested source `docs/api` cùng enabled → `docs/api` không bị copy/ghi đè khi sync root. | ☐ todo |
| 4 | `doc_set.rs build_doc_set_watcher`: đổi throttle → debounce trailing (gom `changed_files`, flush sau ~450ms yên tĩnh) thay vì drop. | Manual: gõ sửa file liên tục → FE vẫn refresh sau cùng (không mất event cuối). | ☐ todo |
| 5 | Thêm command/logic phát hiện remote-ahead: fetch + so local HEAD vs `origin/<branch>`, trả `remote_ahead`/`behind`. Tách khỏi `sync_status` rẻ để không chậm. | Manual với repo có commit mới trên remote → UI gợi ý "Pull". | ☐ todo |
| 6 | `sync_service.rs:326-328` (và force_push 358-360): luôn `copy_enabled_local_to_mirror` trước commit, bỏ gate `if UpToDate`. | Test/manual: sync lỗi → sửa local → sync lại → edit mới được push. Kiểm tra không regress first-push. | ☐ todo |
| 7 | `doc_set.rs` (create/refresh/restore/keep_both/add_source): lấy doc-set dưới lock rồi **drop lock**, làm I/O filesystem, re-acquire khi cần ghi DB (theo pattern sync_service). | Manual: create/refresh repo lớn → UI/query khác không bị khựng. | ☐ todo |
| 8 | `storage.rs:24-57`: ghi manifest & device-mapping qua temp file + `fs::rename` (atomic). | Unit test: ghi/đọc round-trip vẫn đúng. | ☐ todo |

### Đợt 3 — P2 + UX (tùy chọn, ít rủi ro)
| # | Action (file → change) | Verify | Status |
|---|---|---|---|
| 9 | `sync_service.rs classify_sync_error`: match theo `err` variant + `error_kind()` thay substring (giữ fallback). | Unit test mỗi kind → đúng `SyncIssue.kind`/actions. | ☐ todo |
| 10 | `file_compare.rs hash_file`: stream theo buffer thay `fs::read` cả file. | Test hash giữ nguyên kết quả cho file nhỏ. | ☐ todo |
| 11 | `git_provider.rs:57-59`: dùng offset local thay hardcode UTC+7. | Đọc lại commit time = giờ máy. | ☐ todo |
| 12 | `auth.rs`: chỉ lưu keyring sau khi insert account OK (hoặc rollback keyring nếu insert fail). | Test: insert fail → không còn keyring entry rác. | ☐ todo |
| 13 | FE `sync-controls.tsx`: khi auto-sync tắt do lỗi → hiện thông báo lý do. | Manual: gây lỗi sync khi bật auto → thấy message. | ☐ todo |
| 14 | FE `search-bar.tsx`: hiện lỗi search cho user thay vì chỉ console. | Manual: search lỗi → thấy thông báo. | ☐ todo |
| 15 | FE `login-screen.tsx`: thêm nút copy `user_code`. | Manual: bấm copy → mã vào clipboard. | ☐ todo |

_Status legend: ☐ todo · ◐ doing · ✅ done (+evidence) · ⚠️ done-unverified · ❌ blocked._

- Risk / cross-module impact: Không. Module cô lập; thay đổi nằm trong crate `open-sesame` + frontend của nó. Rủi ro nội bộ cao nhất ở #6 (đổi điều kiện copy) và #3 (đổi chữ ký hàm copy) → cần test kỹ.

## Test plan
- Existing: `cargo test` trong `modules/open-sesame/rust` (đã có test cho mirror_service, git_provider, manifest, factory, error).
- New: mỗi row P0/P1/P2 thêm unit test như cột Verify; phần watcher/remote-ahead/UI verify thủ công (ghi rõ "untested by suite vì cần runtime/remote").
- Manual: kịch bản crash-mid-sync (P0-1), pull khi mirror source mất (P0-2), nested source (P1-1).

## Definition of done
Mọi row ✅ kèm bằng chứng · mọi symbol đổi đã grep lại call site · mỗi thay đổi hành vi có test pass hoặc ghi rõ "untested because…".

## Closing reconciliation

### Đợt 1 — 2026-06-05, branch `fix/open-sesame-sync-reliability`
- **#1 (P0-1)** ✅ `db/doc_set_repo.rs::reset_syncing_to_idle()` + gọi trong `lib.rs::setup()` sau migrations. Test `test_reset_syncing_to_idle_only_clears_syncing` pass (chỉ reset `syncing`, không đụng `error`/khác). Evidence: `cargo test -p tauri-plugin-open-sesame` → **106 passed, 0 failed**.
- **#2 (P0-2)** ✅ **làm theo hướng nhất quán (skip)** — quyết định sau khi phân tích cùng user. Phát hiện then chốt: chiều **push** (`copy_enabled_local_to_mirror`) đã **bỏ qua khi local source vắng** (chốt an toàn `if !local.exists() { continue }`), nhưng chiều **pull** lại **xóa trắng folder local** khi mirror source vắng → **bất đối xứng**. Sửa pull cho khớp push: source vắng hoàn toàn → `continue` (không xóa). Bỏ hàm `remove_local_path`. Đổi test cũ `propagates_deleted_mirror_source` → `test_copy_mirror_to_local_skips_missing_mirror_source` (giờ assert local được giữ, `copied=0`). Đánh đổi đã thống nhất với user: không còn lan truyền việc "xóa thẳng nguyên folder trên repo" (hiếm gặp). Evidence: 106 passed, 0 failed.
- **Phụ trợ (bắt buộc để chạy được test)**: thêm `tempfile` vào `[dev-dependencies]` — trước đó **thiếu → toàn bộ test suite của crate không compile** (9 file test dùng `tempfile`); sửa assertion stale trong `test_migrations_idempotent` (1 → 3 migrations). Cả 2 là lỗi pre-existing chỉ lộ ra khi suite chạy lại được.
- Chưa làm (commit sau): P1-1..P1-6, P2-1..P2-4, UX-1..UX-3.

## Confirm before proceeding?
Bạn muốn làm **đợt nào**? Mặc định đề xuất: làm **Đợt 1 (P0)** trước, rồi review tiếp. Xác nhận để tôi bắt đầu code.
