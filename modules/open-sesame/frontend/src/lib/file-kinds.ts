// Classifies a file (by name / extension) into how the explorer should handle a click:
//   'image'    → render inline in the standalone image viewer
//   'text'     → render in the Markdown / text preview (existing behaviour)
//   'external' → open in the OS default app (Word/Excel/PPT/PDF/archives/binaries)
// Plus small path helpers used to resolve a Markdown image `src` against the
// directory of the file being previewed, and to pick a MIME type for a blob.

export type FileKind = 'image' | 'text' | 'external';

export const IMAGE_EXTS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'apng',
]);

// Text / code / structured-text files we can safely show in the text preview.
export const TEXT_EXTS = new Set([
    // markdown & prose
    'md', 'markdown', 'mdown', 'mkdn', 'mdx', 'txt', 'text', 'log', 'rst', 'adoc',
    // data / config
    'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
    'properties', 'csv', 'tsv', 'xml',
    // web
    'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte',
    // scripts / languages
    'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts',
    'rs', 'go', 'py', 'pyi', 'rb', 'php', 'java', 'kt', 'kts', 'scala', 'swift',
    'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'cs', 'm', 'mm',
    'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
    'sql', 'graphql', 'gql', 'proto', 'lua', 'r', 'dart', 'ex', 'exs', 'erl',
    'hs', 'clj', 'cljs', 'pl', 'tf', 'hcl', 'gradle', 'groovy',
    'dockerfile', 'makefile', 'gitignore', 'gitattributes', 'editorconfig',
    'npmrc', 'nvmrc', 'lock',
]);

export function classifyFile(name: string): FileKind {
    const base = name.toLowerCase();
    const dot = base.lastIndexOf('.');
    // Extensionless or dotfiles (README, LICENSE, Dockerfile, .gitignore…) → text.
    if (dot <= 0) return 'text';
    const ext = base.slice(dot + 1);
    if (IMAGE_EXTS.has(ext)) return 'image';
    if (TEXT_EXTS.has(ext)) return 'text';
    return 'external';
}

/** Directory portion of a path (handles both `/` and `\` separators). */
export function dirOf(p: string): string {
    const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return i >= 0 ? p.slice(0, i) : '';
}

/** True for srcs the webview can load directly without filesystem access. */
export function isRemoteOrData(src: string): boolean {
    return /^(https?:|data:|blob:)/i.test(src);
}

/**
 * Resolve a (possibly relative) Markdown image `src` against the previewed
 * file's directory, producing an absolute filesystem path. Handles `./`, `../`,
 * mixed separators, percent-encoding, `file://`, and already-absolute paths
 * (Windows drive, POSIX root, UNC).
 */
export function resolveLocalPath(baseDir: string, src: string): string {
    let s = src.trim();
    try {
        s = decodeURIComponent(s);
    } catch {
        /* keep raw if not valid percent-encoding */
    }
    s = s.replace(/^file:\/\//i, '');
    // Already absolute? (C:\…, /…, \\unc)
    if (/^[a-zA-Z]:[\\/]/.test(s) || s.startsWith('/') || s.startsWith('\\\\')) {
        return s;
    }
    const sep = baseDir.includes('\\') ? '\\' : '/';
    const segs = baseDir.split(/[\\/]/);
    for (const part of s.split(/[\\/]/)) {
        if (part === '' || part === '.') continue;
        if (part === '..') {
            if (segs.length > 1) segs.pop();
            continue;
        }
        segs.push(part);
    }
    return segs.join(sep);
}

export function mimeFromExt(path: string): string {
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    switch (ext) {
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'gif': return 'image/gif';
        case 'webp': return 'image/webp';
        case 'svg': return 'image/svg+xml';
        case 'bmp': return 'image/bmp';
        case 'ico': return 'image/x-icon';
        case 'avif': return 'image/avif';
        case 'apng': return 'image/apng';
        default: return 'application/octet-stream';
    }
}
