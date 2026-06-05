// Backwards-compatible alias.
//
// The launcher's HTML shim (`apps/launcher/modules-pages/video-downloader/main.tsx`)
// historically imported a `VideoDownloader` component. The window is now the
// Media Toolbox; the rename in the shim and registry can land alongside this
// module without breaking older entry references.

export { default } from './MediaToolbox'
