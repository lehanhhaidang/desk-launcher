import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs'
import { get } from 'node:https'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const targetTriple = 'x86_64-pc-windows-msvc'
const binDir = resolve('apps/launcher/src-tauri/binaries')
const ytDlpPath = join(binDir, `yt-dlp-${targetTriple}.exe`)
const ffmpegPath = join(binDir, `ffmpeg-${targetTriple}.exe`)

const ytDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
const ffmpegUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'

function hasFile(path) {
  return existsSync(path) && statSync(path).size > 0
}

function download(url, outputPath) {
  return new Promise((resolveDownload, reject) => {
    get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        const location = response.headers.location
        if (!location) {
          reject(new Error(`Redirect from ${url} did not include a Location header.`))
          return
        }
        download(new URL(location, url).toString(), outputPath).then(resolveDownload, reject)
        return
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`))
        return
      }

      const file = createWriteStream(outputPath)
      response.pipe(file)
      file.on('finish', () => file.close(resolveDownload))
      file.on('error', reject)
    }).on('error', reject)
  })
}

function findFile(root, fileName) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
      return fullPath
    }
    if (entry.isDirectory()) {
      const match = findFile(fullPath, fileName)
      if (match) return match
    }
  }
  return null
}

async function ensureYtDlp() {
  if (hasFile(ytDlpPath)) {
    console.log(`sidecar ok: ${ytDlpPath}`)
    return
  }

  console.log('downloading yt-dlp sidecar...')
  await download(ytDlpUrl, ytDlpPath)
}

async function ensureFfmpeg() {
  if (hasFile(ffmpegPath)) {
    console.log(`sidecar ok: ${ffmpegPath}`)
    return
  }

  console.log('downloading ffmpeg sidecar...')
  const workDir = join(tmpdir(), `desk-launcher-ffmpeg-${Date.now()}`)
  const zipPath = join(workDir, 'ffmpeg-essentials.zip')
  const extractDir = join(workDir, 'extract')

  mkdirSync(workDir, { recursive: true })

  try {
    await download(ffmpegUrl, zipPath)
    execFileSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractDir}' -Force`,
    ], { stdio: 'inherit' })

    const ffmpegExe = findFile(extractDir, 'ffmpeg.exe')
    if (!ffmpegExe) {
      throw new Error('Could not find ffmpeg.exe in the downloaded archive.')
    }
    copyFileSync(ffmpegExe, ffmpegPath)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

if (process.env.SKIP_SIDECARS === '1') {
  console.log('SKIP_SIDECARS=1; skipping sidecar download.')
  process.exit(0)
}

mkdirSync(binDir, { recursive: true })
await ensureYtDlp()
await ensureFfmpeg()
