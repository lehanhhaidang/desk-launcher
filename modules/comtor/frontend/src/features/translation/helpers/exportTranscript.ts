import * as XLSX from 'xlsx';
import type { TranscriptEntry } from '@cmt/types/transcript.types';
import { tauri } from '@cmt/lib/tauri';

/**
 * Sanitize a filename by replacing spaces and special characters with underscores.
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u00C0-\u024F_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Format milliseconds as mm:ss.
 */
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Get the current date formatted as YYYY-MM-DD.
 */
function getDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Escape a CSV field value. Wraps in double quotes if the value contains
 * commas, double quotes, or newlines, and escapes inner double quotes as "".
 */
function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Export transcript entries to a CSV file and trigger a download.
 *
 * CSV format:
 * - Header: Time, Speaker, Language, Original, Translation
 * - Fields are properly escaped for commas, quotes, and newlines
 *
 * @param entries - Array of transcript entries to export
 * @param meetingTitle - Title used for the filename
 */
export async function exportToCSV(entries: TranscriptEntry[], meetingTitle: string): Promise<string | null> {
  const header = 'Time,Speaker,Language,Original,Translation';
  const rows = entries.map((entry) => {
    const time = escapeCSVField(formatTime(entry.startMs));
    const speaker = escapeCSVField(entry.speakerLabel);
    const language = escapeCSVField(entry.language);
    const original = escapeCSVField(entry.originalText);
    const translation = escapeCSVField(entry.translatedText);
    return `${time},${speaker},${language},${original},${translation}`;
  });

  const csvContent = [header, ...rows].join('\n');
  const bytes = new TextEncoder().encode(csvContent);
  const filename = `${sanitizeFilename(meetingTitle)}_${getDateString()}.csv`;
  // Reuse export_xlsx for arbitrary file save (it just writes bytes to chosen path).
  return await tauri.export.xlsx(bytes, filename);
}

/**
 * Export transcript entries to an XLSX file and trigger a download.
 *
 * Creates a workbook with a single "Transcript" sheet containing:
 * Time, Speaker, Language, Original, Translation columns.
 *
 * @param entries - Array of transcript entries to export
 * @param meetingTitle - Title used for the filename
 */
export async function exportToXLSX(entries: TranscriptEntry[], meetingTitle: string): Promise<string | null> {
  const data = entries.map((entry) => ({
    Time: formatTime(entry.startMs),
    Speaker: entry.speakerLabel,
    Language: entry.language,
    Original: entry.originalText,
    Translation: entry.translatedText,
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transcript');

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const bytes = new Uint8Array(buffer);
  const filename = `${sanitizeFilename(meetingTitle)}_${getDateString()}.xlsx`;
  return await tauri.export.xlsx(bytes, filename);
}
