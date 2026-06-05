# Open Sesame — Data-Flow Test Matrix
_Created: 2026-06-05 · Focus: dữ liệu người dùng qua import / mapping / sync / multi-source_

Tài liệu này **không** liệt kê CRUD cơ bản. Chỉ tập trung: **điều gì xảy ra với FILE của người dùng** khi import, map path, sync up/down, force, keep-both, và nhiều source. Mọi hành vi đã trace trực tiếp trên code (file:line ghi kèm).

Ký hiệu: ✅ đúng/an toàn · ⚠️ có bug (mã plan) · ❗ **rủi ro mất/ghi đè dữ liệu** · ⓘ đúng-theo-thiết-kế-nhưng-dễ-bất-ngờ · ❌ chưa xử lý

---

## 0. Mental model (3 lớp dữ liệu)

```
   LOCAL source folder(s)            MIRROR (git working copy)              REMOTE (GitHub)
   <local_path mỗi source>   <-->   ~/.open-sesame/mirrors/<doc_set_id>/  <-->  origin/<branch>
        (nhiều source)                  (commit, loại .open-sesame)
```

- **Mapping** (`.open-sesame/device.local.json`, per-device): mỗi `source` → `{ local_path, enabled, direction }`.
- **Direction**: `two_way` · `local_to_mirror` · `mirror_to_local` · `mirror_only` (chỉ đọc từ mirror, không ghi local).
- **Manifest** (`.open-sesame/doc-set.json`, push lên git): danh sách `sources` (id, alias, `mirror_path`).
- **Copy engine** (`mirror_service.rs`): so **mtime** (chỉ copy khi nguồn mới hơn) + **xóa orphan** ở đích (file ở đích không có ở nguồn → xóa). Skip `.git/.open-sesame/node_modules/.DS_Store/Thumbs.db`.

### ❗ Quy tắc vàng phải nhớ
**Sync = ép đích giống nguồn, gồm cả xóa.**
- `sync_up`  → local là nguồn → mirror bị ép giống local (file xóa ở local sẽ bị xóa khỏi mirror → commit deletion → push).
- `sync_down`→ mirror là nguồn → local bị ép giống mirror (**file chỉ-có-ở-local sẽ bị XÓA**).
- `force_pull` → remote ghi đè tất cả (mất thay đổi local chưa push).
- `force_push` → local ghi đè tất cả (mất commit chỉ-có-trên-remote).

---

## 1. Import từ GitHub (dữ liệu đi VÀO)

| # | Scenario | Kết quả | Status |
|---|---|---|---|
| 1.1 | Import repo có data | `init_local` + `force_pull` vào mirror mới; tạo doc-set, `last_commit`/`last_synced_at` set | ✅ |
| 1.2 | Sau import, data ở đâu? | Chỉ ở **mirror**. `primary` source có `local_path = None` (vì `source_path == mirror`) → **chưa có file nào ra local** cho tới khi user map + restore | ⓘ `github_import_service.rs:66` + `overview.rs:45-50` |
| 1.3 | Map imported doc-set vào folder local **trống** | preflight = `empty` → restore (mirror→local) an toàn | ✅ |
| 1.4 | Map vào folder local **đã có file khác** | preflight = `needs_decision`/`has_conflicts`; nếu chọn restore/import-local → xem mục 5 | ❗ tùy lựa chọn |
| 1.5 | Import repo rỗng | `force_pull` khi remote unborn — cần test thực tế | ⚠️ chưa chắc |
| 1.6 | Import **lại cùng repo** | Tạo doc-set + mirror **trùng** (không dedup) → 2 bản sao trên đĩa | 🆕❌ |
| 1.7 | Network/quyền fail giữa clone | Mirror dở + **không có row DB** → mirror mồ côi | 🆕❌ |
| 1.8 | Import 2 doc-set vào cùng 1 folder local (map trùng) | Không chặn → sync sẽ giẫm chân nhau | ❗❌ |

---

## 2. Mapping path (cách nối local ↔ mirror)

| # | Scenario | Kết quả | Status |
|---|---|---|---|
| 2.1 | Map source → `local_path` là thư mục | `ready` | ✅ |
| 2.2 | `local_path` để trống | `missing_local_path` (blocked, không sync) | ✅ |
| 2.3 | `local_path` trỏ vào 1 **file** (không phải dir) | `path_type_mismatch` (blocked) | ✅ `storage.rs:117` |
| 2.4 | `local_path` chưa tồn tại trên đĩa | sync_up: copy bị `continue` (skip); restore: tạo mới khi copy | ⓘ `transfer.rs:44-46` |
| 2.5 | Đổi mapping path sau khi đã sync | Lần sync sau dùng path mới; **file ở path cũ không tự dọn** | ⓘ |
| 2.6 | `mirror_path` nhiều cấp qua add_mirror_source (vd `docs/api`) | `normalize_mirror_path` cho phép | ✅ `storage.rs:175` |
| 2.7 | Path có `..` / tuyệt đối / `.open-sesame` / `.git` | reject | ✅ |
| 2.8 | Windows path hoa/thường (`Docs` vs `docs`) | so sánh case-sensitive → có thể lệch | ❌ |
| 2.9 | `local_path` trỏ vào folder quan trọng (vd Documents) | **không cảnh báo** → rủi ro lớn ở sync_down/force_pull | ❗❌ |
| 2.10 | Symlink trong local/mirror | chưa xử lý/chưa test | ❌ |

---

## 3. Multi-source (nhiều resource trong 1 doc-set)

| # | Scenario | Kết quả | Status |
|---|---|---|---|
| 3.1 | add_source: copy 1 folder local **mới** vào mirror thành source riêng (slug id, path duy nhất) | ✅ | `sources.rs:18` |
| 3.2 | add_mirror_source: đăng ký 1 **subpath mirror có sẵn** thành source | ✅; dedup theo `mirror_path` | `sources.rs:53` |
| 3.3 | Mỗi source direction khác nhau (vd A=two_way, B=mirror_to_local read-only) | transfer lọc đúng theo direction | ✅ `transfer.rs:32,84` |
| 3.4 | Source `disabled` | Không sync (data nằm yên trong mirror, không đẩy ra local của nó) | ✅ |
| 3.5 | Source `mirror_only` | Đọc được từ mirror, **không bao giờ ghi ra local** | ✅ |
| 3.6 | **Root `.` + sibling source 1 cấp (vd `wasabi`)** cùng bật | Root **loại** sibling khỏi copy → không nhân đôi | ✅ (test `mirror_service` cover) |
| 3.7 | **Root `.` + nested source nhiều cấp (vd `docs/api`)** cùng bật | Root **KHÔNG loại** được nested → **ghi đè/nhân đôi `docs/api`** | ⚠️ **P1-1** |
| 3.8 | 2 source map vào **local path chồng nhau** | Không chặn → giẫm chân, orphan-delete lẫn nhau | ❗❌ |
| 3.9 | 2 source có `mirror_path` chồng nhau (A=`docs`, B=`docs/api`) | Chồng phạm vi → behavior phụ thuộc thứ tự copy | ❗❌ |
| 3.10 | Xóa 1 source bằng remove_new_mirror_path | Chỉ xóa được file **untracked-new**; source đã commit thì reject | ✅ `git_guard` (đã verify đúng) |

---

## 4. Sync UP (local → mirror → remote)

| # | Scenario | Kết quả | Status |
|---|---|---|---|
| 4.1 | Local có file mới/sửa, mirror sạch | copy local→mirror → commit → push | ✅ |
| 4.2 | **Xóa file ở local** rồi sync_up | mirror **xóa file đó** (orphan) → commit deletion → push (đúng two_way) | ⓘ❗ chủ đích |
| 4.3 | Không có thay đổi | "Already up to date", giữ `last_commit`, không commit rỗng | ✅ `git_provider.rs:50-52` |
| 4.4 | Push lần đầu vào repo rỗng | dùng force-refspec tạo branch | ✅ |
| 4.5 | Remote đã đi trước (người khác push) | push bị từ chối → issue `diverged` (retry/force_push/force_pull/manual) | ✅ không auto-merge |
| 4.6 | **Sync trước lỗi → mirror còn "bẩn", giờ sửa thêm local rồi sync_up** | Vì mirror ≠ UpToDate → **bỏ qua copy local mới**, chỉ push state cũ → edit mới không lên | ⚠️ **P1-4** |
| 4.7 | File sửa nhưng mtime cũ hơn mirror (restore backup…) | **không copy** (so mtime) → thay đổi bị bỏ sót | ⓘ❗ |
| 4.8 | Crash giữa lúc push | doc-set kẹt `syncing` mãi | ⚠️ **P0-1** |
| 4.9 | `files_count` báo cho user | Đếm theo mtime/status → có thể **lệch số thực** | ⓘ |

---

## 5. Sync DOWN / Restore (remote → mirror → local) — ❗ vùng nguy hiểm nhất

| # | Scenario | Kết quả | Status |
|---|---|---|---|
| 5.1 | Local trống, sync_down | pull + copy mirror→local; local nhận đủ data | ✅ |
| 5.2 | **Local có file mới CHƯA push, rồi sync_down** | copy mirror→local chạy orphan-delete → **XÓA file chỉ-có-ở-local** | ❗ **mất dữ liệu** (`transfer.rs:103` → `mirror_service:remove_orphaned`) |
| 5.3 | sync_down khi **source folder trong mirror biến mất** | `remove_local_path` → **xóa nguyên folder local** (remove_dir_all) | ❗ **P0-2** |
| 5.4 | Remote diverge thật (không fast-forward) | trả Conflict error, **không** auto-merge, **không** đụng local | ✅ an toàn |
| 5.5 | sync_down chỉ áp dụng fast-forward/unborn/up-to-date | đúng | ✅ `git_provider.rs:194-225` |
| 5.6 | Direction `mirror_to_local` / `two_way` | ghi ra local | ✅ |
| 5.7 | Direction `local_to_mirror` / `mirror_only` | **không** ghi local (bỏ qua trong copy_enabled_mirror_to_local) | ✅ `transfer.rs:83-90` |
| 5.8 | File mtime ở mirror cũ hơn local | **không copy** dù nội dung khác → local giữ bản cũ | ⓘ❗ |

---

## 6. Force operations (ghi đè có chủ đích)

| # | Scenario | Kết quả | Status |
|---|---|---|---|
| 6.1 | `force_push` | commit mirror hiện tại → **force push, ghi đè remote** (mất commit chỉ-có-trên-remote) | ⓘ❗ chủ đích |
| 6.2 | `force_pull` | fetch → **hard-reset mirror về remote** → copy mirror→local (**mất mọi thay đổi local/mirror chưa push**) | ⓘ❗ chủ đích `git_provider.rs:232` |
| 6.3 | force khi chưa setup remote | trả lỗi generic (không phải `setup_required` đẹp như sync_up/down) | ⚠️ lệch nhỏ |
| 6.4 | force_pull rồi local có file lạ không ở remote | hard-reset + copy mirror→local orphan-delete → **xóa** | ❗ chủ đích nhưng dễ bất ngờ |

---

## 7. Conflict / Preflight / Keep-both (quyết định merge dữ liệu)

| # | Scenario | Kết quả | Status |
|---|---|---|---|
| 7.1 | Preflight phân loại same / only_mirror / only_local / conflicts | hash SHA256 toàn file (RAM) | ✅ (P2-2 với file lớn) |
| 7.2 | status `empty` (local trống) | gợi ý restore an toàn | ✅ |
| 7.3 | status `safe` (mirror ⊇ local, không conflict) | restore không mất gì | ✅ |
| 7.4 | status `needs_decision` (local có file riêng) | bắt user chọn | ✅ |
| 7.5 | status `has_conflicts` (cùng path, khác nội dung) | bắt user chọn | ✅ |
| 7.6 | **Keep-both** | file only-local → copy vào mirror; conflict → mirror thêm bản `*.local-copy.*` (giữ bản mirror gốc); **rồi FE tự restore mirror→local** → local có cả 2, bản mirror chiếm tên gốc | ⚠️ đúng dữ liệu nhưng **đổi tên file local không báo rõ** |
| 7.7 | "Import Local" (chỉ map) | copy local→mirror | ⓘ nhãn khó hiểu |
| 7.8 | "Use Repo Mirror" (restore) | mirror→local, **đè local** | ❗ tên nút không cảnh báo |
| 7.9 | Preflight đọc xong, file đổi giữa lúc copy (TOCTOU) | bản hash & bản copy có thể lệch (hiếm) | ⚠️ low |

---

## 8. Multi-device (cùng doc-set trên 2 máy)

| # | Scenario | Kết quả | Status |
|---|---|---|---|
| 8.1 | `device.local.json` per-device | mapping/local_path **không** push lên git (bị loại khỏi commit) | ✅ |
| 8.2 | Máy B clone về (import) | phải tự map local_path riêng cho máy B | ⓘ |
| 8.3 | Máy A xóa file → push; máy B sync_down | máy B **mất file đó** (orphan-delete đúng mirror) | ⓘ❗ |
| 8.4 | Máy A & B sửa cùng file → cùng push | máy push sau bị diverge → phải force/manual | ✅ surface issue |

---

## 9. ❗ BẢNG RỦI RO MẤT/GHI ĐÈ DỮ LIỆU (ưu tiên review)

| Rủi ro | Khi nào | Mức | Liên quan |
|---|---|---|---|
| **sync_down xóa file chỉ-có-ở-local** | user sửa local rồi bấm Pull mà chưa Push | ❗ Cao | 5.2 — cân nhắc cảnh báo/preflight trước sync_down |
| **sync_down xóa nguyên folder local** | source mirror biến mất | ❗ Cao | 5.3 — **P0-2** |
| **force_pull mất thay đổi local/mirror** | user bấm force_pull | ❗ chủ đích | 6.2 — cần xác nhận rõ ràng |
| **force_push mất commit remote** | user bấm force_push | ❗ chủ đích | 6.1 — cần xác nhận rõ ràng |
| **Nested source ghi đè/nhân đôi** | root `.` + `docs/api` cùng bật | ⚠️ | 3.7 — **P1-1** |
| **2 source map chồng local path** | cấu hình multi-source sai | ❗ | 3.8 — nên chặn/validate |
| **Sửa file mtime cũ không sync** | restore backup, đồng bộ tool khác | ⓘ | 4.7/5.8 — cân nhắc hash thay mtime |
| **Mirror mồ côi trên đĩa** | xóa workspace, hoặc create/import fail | 🆕 | rò rỉ dung lượng |

---

## 10. Kịch bản test end-to-end nên chạy (có data thật)

1. **Happy two-way**: tạo doc-set từ folder có file → setup remote → sync_up → sửa 1 file + thêm 1 file + xóa 1 file → sync_up → kiểm tra remote khớp (kể cả file bị xóa).
2. **Import sang máy mới**: import repo → map vào folder trống → restore → đủ file.
3. **❗ Pull đè local**: map vào folder có sẵn file riêng → sync_down → **kiểm tra file riêng còn không** (kỳ vọng: bị xóa → xác nhận đây có phải hành vi mong muốn).
4. **❗ Folder bay màu**: tạo 2 source, xóa 1 source khỏi mirror (hoặc máy khác xóa rồi push) → sync_down → kiểm tra folder local của source đó (P0-2).
5. **Diverge**: 2 máy cùng sửa 1 file → cùng push → máy sau phải thấy issue `diverged` và chọn force/manual; thử cả force_push & force_pull, ghi nhận bên nào mất gì.
6. **Multi-source nested**: root `.` + add_mirror_source `docs/api`, cả hai two_way → sync → kiểm tra `docs/api` có bị nhân đôi/ghi đè không (P1-1).
7. **Direction lẻ**: 1 source `mirror_to_local` (read-only) → sửa local của nó → sync_up → kỳ vọng **không** push thay đổi đó.
8. **Crash mid-sync**: kill app khi đang push file lớn → mở lại → thử sync (P0-1: kỳ vọng kẹt `syncing`).
9. **mtime**: chỉnh sửa file rồi set mtime về quá khứ → sync → kiểm tra có copy không (4.7).
10. **Keep-both**: tạo conflict (cùng path khác nội dung ở local & mirror) → chọn Keep Both → kiểm tra local có `file.md` (bản mirror) + `file.local-copy.md` (bản local).

---

_File này là test-matrix tham chiếu, không phải plan. Cập nhật/di chuyển/xóa tùy ý._
