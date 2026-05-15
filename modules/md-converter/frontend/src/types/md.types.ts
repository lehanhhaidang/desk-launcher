// Mirrors the structs returned by the `md-converter` Rust plugin.

export interface ConvertResult {
  markdown: string
  title: string | null
  source_path: string | null
  format: string
}

export interface BatchEntry {
  source_path: string
  output_path: string | null
  success: boolean
  error?: string
  format?: string
}

export interface BatchRequest {
  paths: string[]
  output_dir: string
  overwrite?: boolean
}

export interface TextConvertRequest {
  content: string
  format: string
  filename?: string
}
