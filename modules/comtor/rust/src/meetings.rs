use crate::db::{now_ms, DbState};
use crate::error::{AppError, AppResult};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Meeting {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub status: String,
    pub mode: String,
    pub duration_ms: i64,
    pub entry_count: i64,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub audio_path: Option<String>,
    pub summary: Option<String>,
    pub speaker_mapping: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptEntry {
    pub id: Option<String>,
    pub speaker_id: Option<String>,
    pub speaker_label: Option<String>,
    pub speaker_number: Option<i64>,
    pub language: Option<String>,
    pub original_text: String,
    pub translated_text: Option<String>,
    pub start_ms: i64,
    pub end_ms: i64,
    pub confidence: Option<f64>,
    pub is_reply: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MeetingDetail {
    #[serde(flatten)]
    pub meeting: Meeting,
    pub entries: Vec<TranscriptEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewMeeting {
    pub project_id: String,
    pub title: String,
    pub mode: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingPatch {
    pub title: Option<String>,
    pub status: Option<String>,
    pub mode: Option<String>,
    pub duration_ms: Option<i64>,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub audio_path: Option<String>,
    pub summary: Option<String>,
    pub speaker_mapping: Option<String>,
}

fn row_to_meeting(row: &rusqlite::Row) -> rusqlite::Result<Meeting> {
    Ok(Meeting {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        status: row.get(3)?,
        mode: row.get(4)?,
        duration_ms: row.get(5)?,
        entry_count: row.get(6)?,
        started_at: row.get(7)?,
        ended_at: row.get(8)?,
        audio_path: row.get(9)?,
        summary: row.get(10)?,
        speaker_mapping: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

const MEETING_COLS: &str = "id, project_id, title, status, mode, duration_ms, entry_count, started_at, ended_at, audio_path, summary, speaker_mapping, created_at, updated_at";

#[tauri::command]
pub fn list_meetings(state: State<DbState>, project_id: String) -> AppResult<Vec<Meeting>> {
    let conn = state.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let sql = format!(
        "SELECT {MEETING_COLS} FROM meetings WHERE project_id = ?1 ORDER BY created_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([&project_id], row_to_meeting)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

#[tauri::command]
pub fn list_recent_meetings(state: State<DbState>, limit: Option<i64>) -> AppResult<Vec<Meeting>> {
    let conn = state.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let lim = limit.unwrap_or(20);
    let sql = format!(
        "SELECT {MEETING_COLS} FROM meetings ORDER BY created_at DESC LIMIT ?1"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([lim], row_to_meeting)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

#[tauri::command]
pub fn get_meeting(state: State<DbState>, id: String) -> AppResult<MeetingDetail> {
    let conn = state.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let sql = format!("SELECT {MEETING_COLS} FROM meetings WHERE id = ?1");
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query([&id])?;
    let meeting = if let Some(row) = rows.next()? {
        row_to_meeting(row)?
    } else {
        return Err(AppError::NotFound(format!("meeting {id}")));
    };

    let mut estmt = conn.prepare(
        "SELECT id, speaker_id, speaker_label, speaker_number, language, original_text, translated_text, start_ms, end_ms, confidence, is_reply
         FROM transcript_entries WHERE meeting_id = ?1 ORDER BY ord ASC",
    )?;
    let erows = estmt.query_map([&id], |row| {
        Ok(TranscriptEntry {
            id: row.get(0)?,
            speaker_id: row.get(1)?,
            speaker_label: row.get(2)?,
            speaker_number: row.get(3)?,
            language: row.get(4)?,
            original_text: row.get(5)?,
            translated_text: row.get(6)?,
            start_ms: row.get(7)?,
            end_ms: row.get(8)?,
            confidence: row.get(9)?,
            is_reply: row.get::<_, Option<i64>>(10)?.map(|v| v != 0),
        })
    })?;
    let mut entries = Vec::new();
    for r in erows {
        entries.push(r?);
    }
    Ok(MeetingDetail { meeting, entries })
}

#[tauri::command]
pub fn create_meeting(state: State<DbState>, input: NewMeeting) -> AppResult<String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(AppError::Invalid("meeting title is required".into()));
    }
    let mode = input.mode.unwrap_or_else(|| "standard".into());
    let id = Uuid::new_v4().to_string();
    let ts = now_ms();
    let conn = state.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    conn.execute(
        "INSERT INTO meetings (id, project_id, title, status, mode, started_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'in_progress', ?4, ?5, ?5, ?5)",
        params![id, input.project_id, title, mode, ts],
    )?;
    Ok(id)
}

#[tauri::command]
pub fn update_meeting(state: State<DbState>, id: String, patch: MeetingPatch) -> AppResult<()> {
    let conn = state.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let ts = now_ms();
    if let Some(v) = patch.title {
        conn.execute("UPDATE meetings SET title=?1, updated_at=?2 WHERE id=?3", params![v, ts, id])?;
    }
    if let Some(v) = patch.status {
        conn.execute("UPDATE meetings SET status=?1, updated_at=?2 WHERE id=?3", params![v, ts, id])?;
    }
    if let Some(v) = patch.mode {
        conn.execute("UPDATE meetings SET mode=?1, updated_at=?2 WHERE id=?3", params![v, ts, id])?;
    }
    if let Some(v) = patch.duration_ms {
        conn.execute("UPDATE meetings SET duration_ms=?1, updated_at=?2 WHERE id=?3", params![v, ts, id])?;
    }
    if let Some(v) = patch.started_at {
        conn.execute("UPDATE meetings SET started_at=?1, updated_at=?2 WHERE id=?3", params![v, ts, id])?;
    }
    if let Some(v) = patch.ended_at {
        conn.execute("UPDATE meetings SET ended_at=?1, updated_at=?2 WHERE id=?3", params![v, ts, id])?;
    }
    if let Some(v) = patch.audio_path {
        conn.execute("UPDATE meetings SET audio_path=?1, updated_at=?2 WHERE id=?3", params![v, ts, id])?;
    }
    if let Some(v) = patch.summary {
        conn.execute("UPDATE meetings SET summary=?1, updated_at=?2 WHERE id=?3", params![v, ts, id])?;
    }
    if let Some(v) = patch.speaker_mapping {
        conn.execute("UPDATE meetings SET speaker_mapping=?1, updated_at=?2 WHERE id=?3", params![v, ts, id])?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_meeting(state: State<DbState>, id: String) -> AppResult<()> {
    let conn = state.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    conn.execute("DELETE FROM meetings WHERE id=?1", [&id])?;
    Ok(())
}

#[tauri::command]
pub fn save_transcript(
    state: State<DbState>,
    meeting_id: String,
    entries: Vec<TranscriptEntry>,
) -> AppResult<i64> {
    let mut conn = state.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM transcript_entries WHERE meeting_id = ?1", [&meeting_id])?;
    for (i, entry) in entries.iter().enumerate() {
        let id = entry.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
        tx.execute(
            "INSERT INTO transcript_entries (id, meeting_id, ord, speaker_id, speaker_label, speaker_number, language, original_text, translated_text, start_ms, end_ms, confidence, is_reply)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                id,
                meeting_id,
                i as i64,
                entry.speaker_id,
                entry.speaker_label,
                entry.speaker_number,
                entry.language,
                entry.original_text,
                entry.translated_text,
                entry.start_ms,
                entry.end_ms,
                entry.confidence.unwrap_or(0.0),
                entry.is_reply.unwrap_or(false) as i64,
            ],
        )?;
    }
    let count = entries.len() as i64;
    tx.execute(
        "UPDATE meetings SET entry_count=?1, updated_at=?2 WHERE id=?3",
        params![count, now_ms(), meeting_id],
    )?;
    tx.commit()?;
    Ok(count)
}
