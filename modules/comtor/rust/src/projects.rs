use crate::db::{now_ms, DbState};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub client_name: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub meeting_count: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewProject {
    pub name: String,
    pub description: Option<String>,
    pub client_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPatch {
    pub name: Option<String>,
    pub description: Option<String>,
    pub client_name: Option<String>,
}

fn row_to_project(row: &rusqlite::Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        client_name: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        meeting_count: row.get::<_, Option<i64>>(6).ok().flatten(),
    })
}

#[tauri::command]
pub fn list_projects(state: State<DbState>) -> AppResult<Vec<Project>> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.description, p.client_name, p.created_at, p.updated_at,
                (SELECT COUNT(*) FROM meetings m WHERE m.project_id = p.id) AS meeting_count
         FROM projects p
         ORDER BY p.updated_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_project)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

#[tauri::command]
pub fn get_project(state: State<DbState>, id: String) -> AppResult<Project> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.description, p.client_name, p.created_at, p.updated_at,
                (SELECT COUNT(*) FROM meetings m WHERE m.project_id = p.id) AS meeting_count
         FROM projects p WHERE p.id = ?1",
    )?;
    let mut rows = stmt.query([&id])?;
    if let Some(row) = rows.next()? {
        Ok(row_to_project(row)?)
    } else {
        Err(AppError::NotFound(format!("project {id}")))
    }
}

#[tauri::command]
pub fn create_project(state: State<DbState>, input: NewProject) -> AppResult<String> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(AppError::Invalid("project name is required".into()));
    }
    let id = Uuid::new_v4().to_string();
    let ts = now_ms();
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    conn.execute(
        "INSERT INTO projects (id, name, description, client_name, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        rusqlite::params![id, name, input.description, input.client_name, ts],
    )?;
    Ok(id)
}

#[tauri::command]
pub fn update_project(state: State<DbState>, id: String, patch: ProjectPatch) -> AppResult<()> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let ts = now_ms();
    if let Some(name) = patch.name {
        conn.execute(
            "UPDATE projects SET name = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![name, ts, id],
        )?;
    }
    if let Some(desc) = patch.description {
        conn.execute(
            "UPDATE projects SET description = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![desc, ts, id],
        )?;
    }
    if let Some(client) = patch.client_name {
        conn.execute(
            "UPDATE projects SET client_name = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![client, ts, id],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_project(state: State<DbState>, id: String) -> AppResult<()> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    conn.execute("DELETE FROM projects WHERE id = ?1", [&id])?;
    Ok(())
}
