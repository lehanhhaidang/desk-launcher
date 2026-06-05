# Adding a New Module

Step-by-step checklist. Example uses ID `screenshot-capturer`. Read [README.md](README.md) first if you haven't.

## Before you start

Decide once:

| Thing | Example | Used as |
|---|---|---|
| Module ID | `screenshot-capturer` | Rust plugin name, window label, data dir, Vite entry key — **same string everywhere** |
| Display name | "Screenshot Capturer" | Dashboard card + window title |
| Window size | 1000×700, min 800×500 | TS + Rust registries |
| TS alias | `@scr` | Optional short import alias |
| Extra permissions | `fs:allow-write-file`, etc. | Capability JSON |

If the module ships a sidecar binary, also plan: binary name(s), download source, capability `shell:allow-execute` entries.

---

## Steps

### 1. Create the folder skeleton

```
modules/screenshot-capturer/
|-- rust/
|   |-- Cargo.toml
|   |-- build.rs
|   |-- src/lib.rs
|   `-- permissions/default.toml
`-- frontend/src/
    |-- ScreenshotCapturer.tsx
    |-- styles.css
    `-- api/screenshot-capturer-api.ts
```

### 2. `modules/screenshot-capturer/rust/Cargo.toml`

```toml
[package]
name = "tauri-plugin-screenshot-capturer"
version = "0.1.0"
edition.workspace = true
links = "tauri-plugin-screenshot-capturer"   # REQUIRED, must be unique

[dependencies]
tauri = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
log = { workspace = true }
thiserror = { workspace = true }
launcher-paths = { path = "../../../crates/launcher-paths" }
# ... module-specific deps

[build-dependencies]
tauri-plugin = { workspace = true, features = ["build"] }
```

### 3. `modules/screenshot-capturer/rust/build.rs`

```rust
const COMMANDS: &[&str] = &["list_displays", "capture_display", "save_screenshot"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
```

Every `#[tauri::command]` function you expose must appear here.

### 4. `modules/screenshot-capturer/rust/permissions/default.toml`

```toml
"$schema" = "schemas/schema.json"

[default]
description = "Allows every Screenshot Capturer plugin command."
permissions = [
    "allow-list-displays",
    "allow-capture-display",
    "allow-save-screenshot",
]
```

Naming: command `foo_bar` becomes permission `allow-foo-bar`.

### 5. `modules/screenshot-capturer/rust/src/lib.rs`

```rust
use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::Wry;

#[derive(Debug, Serialize)]
pub struct DisplayInfo { pub id: u32, pub name: String, pub width: u32, pub height: u32 }

#[tauri::command]
fn list_displays() -> Result<Vec<DisplayInfo>, String> { Ok(vec![]) }

#[tauri::command]
fn capture_display(display_id: u32) -> Result<Vec<u8>, String> { Err("todo".into()) }

#[tauri::command]
fn save_screenshot(data: Vec<u8>, filename: String) -> Result<String, String> {
    let dir = launcher_paths::module_data_dir("screenshot-capturer").map_err(|e| e.to_string())?;
    let path = dir.join(&filename);
    std::fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

pub fn init() -> TauriPlugin<Wry> {
    Builder::new("screenshot-capturer")   // plugin name = module ID
        .invoke_handler(tauri::generate_handler![list_displays, capture_display, save_screenshot])
        .build()
}
```

### 6. Register in workspace — root `Cargo.toml`

```toml
[workspace]
members = [
    # ... existing ...
    "modules/screenshot-capturer/rust",
]
```

### 7. Add plugin dep — `apps/launcher/src-tauri/Cargo.toml`

```toml
[dependencies]
# ... existing ...
tauri-plugin-screenshot-capturer = { path = "../../../modules/screenshot-capturer/rust" }
```

### 8. Register plugin — `apps/launcher/src-tauri/src/lib.rs`

```rust
.plugin(tauri_plugin_screenshot_capturer::init())
```

(Note: hyphen in `Cargo.toml`, underscore in `use` — standard Rust.)

### 9. Add window spec — `apps/launcher/src-tauri/src/module_registry.rs`

```rust
ModuleWindowSpec {
    id: "screenshot-capturer",
    title: "📸 Screenshot Capturer",
    initial_url: "modules-pages/screenshot-capturer/index.html",
    width: 1000.0, height: 700.0,
    min_width: Some(800.0), min_height: Some(500.0),
},
```

### 10. Add dashboard metadata — `apps/launcher/src/modules/registry.ts`

```typescript
{
    id: 'screenshot-capturer',
    displayName: 'Screenshot Capturer',
    shortName: 'Screenshot',
    description: 'Capture screen regions and save as PNG.',
    icon: 'file-text',
    category: 'utility',
    accentClass: 'from-pink-500/20 to-rose-400/10 text-pink-300 border-pink-400/20',
    health: 'beta',
    windowConfig: {
        title: 'Screenshot Capturer',
        width: 1000, height: 700, minWidth: 800, minHeight: 500,
        initialUrl: 'modules-pages/screenshot-capturer/index.html',
    },
},
```

**Must match step 9** — same id, same initialUrl, same dimensions.

### 11. Create capability — `apps/launcher/src-tauri/capabilities/screenshot-capturer.json`

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "screenshot-capturer-window",
  "windows": ["screenshot-capturer"],
  "permissions": [
    "core:default",
    "dialog:default",
    "log:default",
    "screenshot-capturer:default"
  ]
}
```

Add `fs:allow-write-file`, `shell:allow-execute`, etc. as needed.

### 12. Create the HTML shim

`apps/launcher/modules-pages/screenshot-capturer/index.html`:

```html
<!doctype html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Screenshot Capturer</title></head>
  <body><div id="root"></div><script type="module" src="./main.tsx"></script></body>
</html>
```

`apps/launcher/modules-pages/screenshot-capturer/main.tsx`:

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import ScreenshotCapturer from '@modules/screenshot-capturer/frontend/src/ScreenshotCapturer'
import '@modules/screenshot-capturer/frontend/src/styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ScreenshotCapturer /></React.StrictMode>
)
```

### 13. Add Vite entry + (optional) alias — `apps/launcher/vite.config.ts`

```typescript
resolve: {
    alias: {
        // ... existing ...
        '@scr': path.resolve(__dirname, '../../modules/screenshot-capturer/frontend/src'),
    },
},
build: {
    rollupOptions: {
        input: {
            // ... existing ...
            'screenshot-capturer': resolve(__dirname, 'modules-pages/screenshot-capturer/index.html'),
        },
    },
},
```

Mirror in `apps/launcher/tsconfig.json` if you added the alias:

```json
"paths": { "@scr/*": ["../../modules/screenshot-capturer/frontend/src/*"] },
"include": [ /* ... */ "../../modules/screenshot-capturer/frontend/src" ]
```

### 14. Write the module frontend

`modules/screenshot-capturer/frontend/src/styles.css`:

```css
@import 'tailwindcss';

@source ".";
@source "../../../../packages/ui/src";
```

`modules/screenshot-capturer/frontend/src/api/screenshot-capturer-api.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core'

const ns = (cmd: string) => `plugin:screenshot-capturer|${cmd}`

export const listDisplays = () => invoke<DisplayInfo[]>(ns('list_displays'))
export const captureDisplay = (displayId: number) => invoke<number[]>(ns('capture_display'), { displayId })
export const saveScreenshot = (data: Uint8Array, filename: string) =>
    invoke<string>(ns('save_screenshot'), { data: Array.from(data), filename })
```

`modules/screenshot-capturer/frontend/src/ScreenshotCapturer.tsx`:

```typescript
import { useState, useEffect } from 'react'
import { Button } from '@desk-launcher/ui'
import { listDisplays } from './api/screenshot-capturer-api'

export default function ScreenshotCapturer() {
    const [displays, setDisplays] = useState<any[]>([])
    useEffect(() => { listDisplays().then(setDisplays).catch(console.error) }, [])
    return <div className="p-6">{/* UI here */}</div>
}
```

---

## Verify

```powershell
npm install
npm run dev
```

Check:
1. Cargo compiles → if `links field clash`, recheck steps 2-4.
2. Dashboard shows the new card → recheck step 10 if not.
3. Card click opens a window → if "unknown module id", recheck step 9.
4. Window renders UI → if blank, recheck steps 12-13.
5. `invoke` works → if "not allowed by ACL", recheck step 11.

---

## The sync points (most common source of bugs)

These describe the same module and must stay in lockstep:

| File | What it has |
|---|---|
| Root `Cargo.toml` | Workspace member entry |
| `apps/launcher/src-tauri/Cargo.toml` | Path dep |
| `apps/launcher/src-tauri/src/lib.rs` | `.plugin(...)` call |
| `apps/launcher/src-tauri/src/module_registry.rs` | Window spec |
| `apps/launcher/src-tauri/capabilities/<id>.json` | Capability file |
| `apps/launcher/src/modules/registry.ts` | Dashboard metadata |
| `apps/launcher/vite.config.ts` | Rollup input entry |
| `apps/launcher/tsconfig.json` (optional) | TS alias |
| `modules/<id>/rust/build.rs` | `COMMANDS` array |
| `modules/<id>/rust/permissions/default.toml` | `allow-*` list |

Drift between any of these = "compiles but doesn't work."
