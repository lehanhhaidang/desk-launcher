import { invoke } from '@tauri-apps/api/core'
import type {
  BatchEntry,
  BatchRequest,
  ConvertResult,
  TextConvertRequest,
} from '../types/md.types'

const ns = (cmd: string) => `plugin:md-converter|${cmd}`

export function convertFile(path: string) {
  return invoke<ConvertResult>(ns('convert_file'), { path })
}

export function convertText(req: TextConvertRequest) {
  return invoke<ConvertResult>(ns('convert_text'), { request: req })
}

export function convertBatch(req: BatchRequest) {
  return invoke<BatchEntry[]>(ns('convert_batch'), { request: req })
}

export function supportedExtensions() {
  return invoke<string[]>(ns('supported_extensions'))
}
