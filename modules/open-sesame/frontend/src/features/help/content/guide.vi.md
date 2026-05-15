# Hướng Dẫn Sử Dụng Open Sesame

Open Sesame giúp quản lý tài liệu dự án, đọc Markdown, map folder theo từng thiết bị và sync qua GitHub. App giữ một bản mirror Git cục bộ, sau đó mỗi máy tự chọn nơi tài liệu sẽ nằm trên máy đó.

## Khái Niệm Chính

| Thuật ngữ | Ý nghĩa |
| --- | --- |
| Workspace | Nhóm logic để phân loại doc sets (ví dụ: "Công ty", "Freelance", "Cá nhân"). |
| Doc Set | Một bộ tài liệu được Open Sesame quản lý, gắn với một GitHub repo. |
| Mirror | Bản Git local do Open Sesame giữ tại `~/.open-sesame/mirrors/`. |
| Device Path | Folder hoặc file path được chọn trên máy hiện tại. |
| Mapping | Liên kết giữa folder/file trong repo và path trên máy. |
| Strategy | Cách app xử lý folder gốc: **Standalone** (git trực tiếp) hoặc **Mirrored** (copy sang mirror riêng). |

## Bắt Đầu

1. Mở Open Sesame lần đầu.
2. Nhấn **Login with GitHub** — app hiển thị mã device code.
3. Mở trình duyệt, nhập mã code và xác nhận trên GitHub.
4. Quay lại app — đăng nhập thành công.
5. Tạo workspace đầu tiên bằng nút **+** trên sidebar.

## Tạo Hoặc Import Doc Set

### Từ Local Folder

1. Mở workspace → nhấn **Add Doc Set**.
2. Nhập **Display Name** (tên hiển thị).
3. Nhấn **Browse** → chọn folder tài liệu trên máy.
4. App tự detect strategy:
   - Folder nằm **ngoài** git repo → Standalone.
   - Folder nằm **trong** git repo khác → Mirrored (tạo mirror riêng).
5. *(Tùy chọn)* Check **Create GitHub repo** để push lên repo mới.
6. Nhấn **Create & Map** → app mở Device Paths để cấu hình mapping.

### Từ GitHub Repo

1. Mở workspace → nhấn **Add Doc Set**.
2. Chuyển sang tab **GitHub Repo**.
3. Nhập URL repository (ví dụ: `https://github.com/you/docs.git`).
4. *(Tùy chọn)* Nhập Display Name.
5. Nhấn **Import & Map** → app clone repo và mở Device Paths.

### Setup GitHub Remote Sau

Nếu tạo doc set mà chưa có GitHub repo:

1. Toolbar sẽ hiện nút **Setup GitHub**.
2. Nhấn vào → chọn **Create new repository** hoặc **Link existing**.
3. Xác nhận → app tạo hoặc link repo.

## Map Device Paths

Nhấn **Device Paths** trên toolbar để chọn nơi tài liệu sẽ nằm trên máy hiện tại.

### Quick Setup

1. Nhấn **Select Whole Repo** để check toàn bộ tree.
2. Ở panel phải, nhấn **Path** để browse chọn local folder.
3. Nhấn **Confirm Mapping**.

### Advanced Mapping

Cho trường hợp nhiều folder cần map vào nhiều local path khác nhau:

1. **Panel trái — Repo tree**: check các folder/file muốn map.
2. **Panel phải — Chi tiết**: cấu hình từng item:
   - **Local path**: browse hoặc nhập đường dẫn.
   - **Sync mode**: chọn chiều đồng bộ.
   - **Enabled**: bật/tắt mapping.
3. Nhấn **Confirm Mapping**.

### Các Chế Độ Sync

| Chế độ | Hành vi |
| --- | --- |
| Two-way | Thay đổi sync 2 chiều. |
| Local to mirror | Chỉ push local → mirror. |
| Mirror to local | Chỉ pull mirror → local. |
| Keep in mirror only | File chỉ ở trong mirror, không map ra local. |

### Preflight Check

Khi map vào path đã có file, app so sánh 2 bên:

| Metric | Ý nghĩa |
| --- | --- |
| Same | Files giống hệt. |
| Only in repo | Files chỉ có trong mirror. |
| Only local | Files chỉ có ở local. |
| Conflicts | Cùng tên nhưng khác nội dung. |

Rồi chọn cách xử lý:

| Option | Hành vi |
| --- | --- |
| Map Only | Chỉ ghi nhận mapping, không copy file. Sync bắt đầu từ lần push/pull sau. |
| Import Local | Copy local → mirror. Local là source of truth, changes chờ push. |
| Keep Both | Merge 2 bên, không xóa gì. Cả local và mirror đều có tất cả files. |
| Use Repo Mirror | Copy mirror → local. Repo là source of truth, ghi đè local. |

> **Mẹo:** Nếu tất cả files đều SAME và 0 conflicts → chọn **Map Only** là đủ.

### Thêm Local Folder Mới Vào Repo

Ở cuối trang Device Paths, mở **"Add a new local folder into this repo"**:

1. Nhập **Folder name in repo root**.
2. Nhấn **Choose Folder** để browse.
3. Nhấn **Add To Repo** — folder được copy vào mirror và map tự động.

## Sync Với GitHub

### Các Nút Trên Toolbar

| Nút | Chức năng |
| --- | --- |
| **Push** ↑ | Commit và push local changes lên GitHub. |
| **Pull** ↓ | Fetch, merge từ GitHub, rồi copy về local paths đã map. |
| **🔄** | Refresh trạng thái sync. |
| **Status badge** | Trạng thái hiện tại (Up to date / Changes / Error / Conflict). |
| **Auto** | Bật/tắt auto sync (push tự động mỗi 5 phút khi có thay đổi). |

### Push

1. Edit tài liệu ở local folder (bằng VS Code, Obsidian, etc.).
2. Quay lại Open Sesame — badge hiện **"Changes"**.
3. Nhấn **Push** ↑.
4. App copy files thay đổi → mirror → commit → push lên GitHub.

### Pull

1. Nhấn **Pull** ↓.
2. App fetch từ GitHub, merge, rồi copy files mới về local folder.

### Auto Sync

- Tự động push mỗi 5 phút khi có thay đổi.
- Nếu có lỗi/conflict → tắt auto sync và hiện notification.
- Auto sync chỉ push — bạn cần pull thủ công.

### Force Push / Force Pull

Khi sync thường bị lỗi do conflict:

| Action | Hành vi | ⚠️ Cẩn thận |
| --- | --- | --- |
| Force Push | Ghi đè **toàn bộ remote** bằng local mirror. | Remote history có thể bị mất. |
| Force Pull | Ghi đè **toàn bộ local mirror** bằng remote. | Local changes sẽ bị mất. |

Cả 2 đều yêu cầu xác nhận.

### Trạng Thái Sync

| Badge | Ý nghĩa |
| --- | --- |
| Up to date | Mirror đã sync, không có local changes. |
| Changes | Có files thay đổi chưa push. |
| Setup required | Chưa có GitHub repo. |
| Not synced | Mirror chưa được init. |
| Error | Lỗi khi sync. |
| Conflict | Có conflict chưa resolve. |

### Sync History

Nhấn nút **History** (đồng hồ) trên toolbar để xem lịch sử:

- Thời điểm, hướng (push/pull), số files, trạng thái, commit hash.

## File Explorer

### File Tree

- Click file → mở preview bên phải.
- Click folder → expand/collapse.
- Kéo viền sidebar để resize.
- Nhấn **≡** để ẩn/hiện sidebar.

### Badge Trạng Thái File

| Badge | Ý nghĩa |
| --- | --- |
| new | File mới, Git chưa track. |
| modified | File đã thay đổi nội dung. |
| deleted | File đã bị xóa, sẽ được xóa trên Git. |
| conflict | Git cần xử lý conflict thủ công. |

### Markdown Preview

Tính năng hỗ trợ:

- Headings (H1–H6) với anchor links
- Tables (GitHub Flavored Markdown)
- Code blocks với syntax highlighting
- Mermaid diagrams (` ```mermaid `)
- Links, images, task lists
- Bold, italic, strikethrough

Files không phải markdown (.txt, .json, .yaml, etc.) hiển thị dạng plain text.

### Tìm Kiếm

Nhấn nút **Search** (kính lúp) trên toolbar:

1. Nhập từ khóa.
2. Kết quả hiện files match + preview nội dung.
3. Click kết quả để mở file.

## Workflow An Toàn Cho Nhiều Thiết Bị

Trên máy mới:

1. Cài Open Sesame và đăng nhập cùng GitHub account.
2. Import GitHub repo thành doc set.
3. Mở **Device Paths**.
4. Chọn toàn bộ repo hoặc từng folder.
5. Chọn local paths cho máy hiện tại.
6. Dùng preflight để quyết định cách xử lý files đã có.

GitHub là nguồn dữ liệu chung, nhưng mỗi thiết bị vẫn dùng cấu trúc folder local riêng.

## Xóa Doc Set

1. Hover lên doc set card ở sidebar.
2. Nhấn nút **xóa** (thùng rác).
3. Xác nhận.

> **Lưu ý:** Xóa doc set chỉ xóa bản ghi trong Open Sesame. Files trên máy và trên GitHub không bị ảnh hưởng.
