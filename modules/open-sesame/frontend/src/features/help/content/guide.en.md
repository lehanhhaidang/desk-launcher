# Open Sesame Guide

Open Sesame keeps project documentation easy to read, map, and sync across devices. The app works with a local mirror of your GitHub repository, then lets each computer choose where the editable files should live.

## Core Ideas

| Term | Meaning |
| --- | --- |
| Workspace | A logical group for organizing doc sets (e.g. "Company", "Freelance", "Personal"). |
| Doc Set | A documentation collection managed by Open Sesame, backed by a GitHub repo. |
| Mirror | The local Git copy stored under `~/.open-sesame/mirrors/`. |
| Device Path | A folder or file path chosen on this computer. |
| Mapping | The link between a repo folder/file and a device path. |
| Strategy | How the app handles the source folder: **Standalone** (direct git) or **Mirrored** (copy to a separate mirror). |

## Getting Started

1. Launch Open Sesame for the first time.
2. Click **Login with GitHub** — the app shows a device code.
3. Open the browser link, enter the code, and authorize.
4. Return to the app — you're logged in.
5. Create your first workspace using the **+** button on the sidebar.

## Create Or Import A Doc Set

### From a Local Folder

1. Open a workspace → click **Add Doc Set**.
2. Enter a **Display Name**.
3. Click **Browse** and select your documentation folder.
4. The app detects the strategy automatically:
   - Folder is **outside** any git repo → Standalone.
   - Folder is **inside** another git repo → Mirrored (creates a separate mirror).
5. *(Optional)* Check **Create GitHub repo** to push the folder to a new GitHub repository.
6. Click **Create & Map** → the app opens Device Paths for initial mapping.

### From a GitHub Repo

1. Open a workspace → click **Add Doc Set**.
2. Switch to the **GitHub Repo** tab.
3. Enter the repository URL (e.g. `https://github.com/you/docs.git`).
4. *(Optional)* Enter a Display Name.
5. Click **Import & Map** → the app clones the repo and opens Device Paths.

### Setup GitHub Remote Later

If you created a doc set without a GitHub repo:

1. The toolbar will show a **Setup GitHub** button.
2. Click it → choose **Create new repository** or **Link existing**.
3. Confirm → the app creates or links the repo.

## Map Device Paths

Use **Device Paths** on the toolbar to decide where repo content should live on this computer.

### Quick Setup

1. Click **Select Whole Repo** to check the entire tree.
2. In the right panel, click **Path** to browse for a local folder.
3. Click **Push from local** (your local files win) or **Pull from repo** (the repo's files win).

### Advanced Mapping

For multi-device setups where different folders need different local paths:

1. **Left panel — Repo tree**: check the folders/files you want to map.
2. **Right panel — Detail**: configure each selected item:
   - **Local path**: browse or type the path on this machine.
   - **Enabled**: toggle whether this source syncs on this device.
3. Click **Push from local** or **Pull from repo** to apply (see below).

### Push From Local vs Pull From Repo

When you confirm a mapping you choose which side wins right now. Both are
directional and **never delete** the other side's unique files:

| Action | Behavior |
| --- | --- |
| **Push from local** | This device wins — your local files overwrite the repo mirror on conflicts. Files that exist only in the repo are kept. |
| **Pull from repo** | The repo wins — the repo mirror overwrites your local files on conflicts. Files that exist only on your device are kept. |

After this initial choice the source stays two-way: use the **Pull** / **Push** toolbar buttons (or auto-sync) for day-to-day syncing.

### Impact Preview

When Push or Pull would change existing files, a preview appears first so you
see exactly what happens before confirming. For the direction you chose:

| Column | Meaning |
| --- | --- |
| **Overwrite** | Files that differ — the winning side replaces the losing side. |
| **Add** | Files brought over from the winning side. |
| **Keep** | Files that exist only on the losing side — left untouched (never deleted). |

The affected files are listed; click **Push from local** / **Pull from repo** to apply, or **Cancel**. If nothing differs, the mapping is applied without a prompt.

> Push/Pull never delete files — the only effect is who wins on conflicting files.

### Add a New Local Folder to the Repo

At the bottom of Device Paths, expand **"Add a new local folder into this repo"**:

1. Enter a **Folder name in repo root**.
2. Click **Choose Folder** to browse.
3. Click **Add To Repo** — the folder is copied into the mirror and mapped automatically.

## Sync With GitHub

### Toolbar Buttons

| Button | Function |
| --- | --- |
| **Push** ↑ | Commit and push local changes to GitHub. |
| **Pull** ↓ | Fetch and merge GitHub changes, then copy to mapped local paths. |
| **🔄** | Refresh sync status. |
| **Status badge** | Shows current state (Up to date / Changes / Error / Conflict). |
| **Auto** | Toggle automatic sync (pushes every 5 minutes when changes detected). |

### Push Flow

1. Edit files in your local folder (using VS Code, Obsidian, etc.).
2. Return to Open Sesame — the status badge shows **"Changes"**.
3. Click **Push** ↑.
4. The app copies changed files to the mirror, commits, and pushes to GitHub.

### Pull Flow

1. Click **Pull** ↓.
2. The app fetches from GitHub, merges, and copies updated files to your local folder.

### Auto Sync

- Pushes automatically every 5 minutes when changes are detected.
- If an error or conflict occurs, auto sync is disabled and a notification appears.
- Auto sync only pushes — you still need to pull manually.

### Pull on Open / Push on Close

- When you open Open Sesame, a prompt offers to **Pull** the latest from every connected doc set so you start in sync.
- When you close the window, a prompt offers to **Push** your changes first. It shows progress, reports the result, then closes after a short countdown. If a push fails, the window stays open so nothing is lost.
- These prompts are separate from **Auto Sync** — toggling Auto does not change them.

### Force Push / Force Pull

When normal sync fails due to conflicts:

| Action | Effect | ⚠️ Caution |
| --- | --- | --- |
| Force Push | Overwrites the **entire remote** with your local mirror. | Remote history may be lost. |
| Force Pull | Overwrites your **entire local mirror** with the remote. | Local changes will be lost. |

Both require explicit confirmation.

### Sync Status

| Badge | Meaning |
| --- | --- |
| Up to date | Mirror is synced, no pending changes. |
| Changes | Files changed but not pushed yet. |
| Setup required | No GitHub repo linked. |
| Not synced | Mirror not initialized. |
| Error | An error occurred during sync. |
| Conflict | Unresolved Git conflicts. |

### Sync History

Click the **History** button (clock icon) on the toolbar to view past sync operations:

- Timestamp, direction (push/pull), file count, status, and commit hash.

## File Explorer

### File Tree

- Click a file to preview it on the right.
- Click a folder to expand/collapse.
- Drag the sidebar edge to resize.
- Click the **≡** button to hide/show the sidebar.

### File Status Badges

| Badge | Meaning |
| --- | --- |
| new | File exists locally but is not tracked by Git yet. |
| modified | File content has changed since the last commit. |
| deleted | File was removed and will be deleted in Git. |
| conflict | Git needs manual conflict resolution. |

### Markdown Preview

Supported features:

- Headings (H1–H6) with anchor links
- GitHub Flavored Markdown tables
- Code blocks with syntax highlighting
- Mermaid diagrams (` ```mermaid `)
- Links, task lists, bold/italic/strikethrough
- **Inline images**, including local image files referenced from the document

Text and code files (.txt, .json, .yaml, etc.) are shown as plain text. Clicking an **image** file opens it in an inline viewer; **other binary files** (Word, Excel, PowerPoint, PDF, …) open in your operating system's default app.

### Search

Click the **Search** icon on the toolbar:

1. Enter a keyword.
2. Results show matching files with content preview.
3. Click a result to open the file.

## Safe Multi-Device Workflow

On a new computer:

1. Install Open Sesame and log in with the same GitHub account.
2. Import the GitHub repo as a doc set.
3. Open **Device Paths**.
4. Select the whole repo or specific folders.
5. Choose local paths for this computer.
6. For each mapping choose **Pull from repo** (repo wins); the impact preview shows what will change.

This keeps GitHub as the shared source of truth while allowing every device to use different local folder locations.

## Deleting a Doc Set

1. Hover over the doc set card in the sidebar.
2. Click the **trash** icon.
3. Confirm deletion.

> **Note:** Deleting a doc set only removes it from Open Sesame. Files on your machine and on GitHub are not affected.
