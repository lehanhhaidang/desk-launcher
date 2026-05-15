use crate::error::AppResult;
use crate::models::account::{Account, ProviderType};
use rusqlite::{params, Connection, OptionalExtension, Row};

fn row_to_account(row: &Row) -> rusqlite::Result<Account> {
    let provider_str: String = row.get("provider")?;
    let provider = ProviderType::from_str(&provider_str).unwrap_or(ProviderType::Github);

    Ok(Account {
        id: row.get("id")?,
        provider,
        username: row.get("username")?,
        token: row.get("token")?,
        refresh_token: row.get("refresh_token")?,
        avatar_url: row.get("avatar_url")?,
        is_default: row.get::<_, i32>("is_default")? != 0,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn insert(conn: &Connection, account: &Account) -> AppResult<()> {
    conn.execute(
        "INSERT INTO accounts (id, provider, username, token, refresh_token, avatar_url, is_default, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            account.id,
            account.provider.as_str(),
            account.username,
            account.token,
            account.refresh_token,
            account.avatar_url,
            account.is_default as i32,
            account.created_at,
            account.updated_at,
        ],
    )?;
    Ok(())
}

pub fn find_by_id(conn: &Connection, id: &str) -> AppResult<Option<Account>> {
    let mut stmt = conn.prepare("SELECT * FROM accounts WHERE id = ?1")?;
    let result = stmt.query_row(params![id], row_to_account).optional()?;
    Ok(result)
}

pub fn list_all(conn: &Connection) -> AppResult<Vec<Account>> {
    let mut stmt = conn.prepare("SELECT * FROM accounts ORDER BY is_default DESC, username")?;
    let rows = stmt.query_map([], row_to_account)?;
    let accounts: Vec<Account> = rows.filter_map(|r| r.ok()).collect();
    Ok(accounts)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])?;
    Ok(())
}
