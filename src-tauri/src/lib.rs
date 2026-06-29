mod db;
mod logging;
mod mongo;

use db::{
    apply_row_mutations, cancel_query as cancel_query_db, connect_database as connect_database_db,
    count_table_rows, disconnect_database as disconnect_database_db,
    fetch_schema as fetch_schema_db, fetch_table_rows, run_query, ConnectionConfig, QueryOutcome,
    RowMutation, Sort, TableRef, TableRows, TableSchema, DEFAULT_ROW_LIMIT,
};
use mongo::MongoConfig;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Greetings from Tauri.", name)
}

// Reads the `engine` tag off a raw config so connect can route a `mongodb` config to the Mongo
// module and any SQL config to `db.rs`. The full config is deserialized by whichever path owns it
// (`ConnectionConfig` is the SQL serde-tagged enum; `MongoConfig` is the Mongo shape).
fn config_engine(config: &serde_json::Value) -> Option<&str> {
    config.get("engine").and_then(serde_json::Value::as_str)
}

// Opens + holds a connection for this id and returns the catalog (SQL tables or Mongo
// collections). The only command that takes `config`; the rest address the held connection by id
// and dispatch on which registry holds it. Takes a raw JSON value so the `mongodb` engine - which
// is not part of the SQL `ConnectionConfig` enum - can be routed before typed deserialization.
#[tauri::command]
async fn connect_database(
    connection_id: String,
    config: serde_json::Value,
) -> Result<Vec<TableRef>, String> {
    if config_engine(&config) == Some("mongodb") {
        let mongo_config: MongoConfig =
            serde_json::from_value(config).map_err(|error| error.to_string())?;
        return mongo::connect(connection_id, mongo_config).await;
    }
    let sql_config: ConnectionConfig =
        serde_json::from_value(config).map_err(|error| error.to_string())?;
    connect_database_db(connection_id, sql_config).await
}

#[tauri::command]
async fn disconnect_database(connection_id: String) {
    if mongo::is_connected(&connection_id) {
        mongo::disconnect(connection_id).await;
        return;
    }
    disconnect_database_db(connection_id).await
}

#[tauri::command]
async fn fetch_table(
    connection_id: String,
    schema: Option<String>,
    table: String,
    limit: Option<u32>,
    offset: Option<u32>,
    filter: Option<String>,
    sort: Option<Sort>,
) -> Result<TableRows, String> {
    if mongo::is_connected(&connection_id) {
        return mongo::fetch_documents(
            connection_id,
            table,
            limit.unwrap_or(DEFAULT_ROW_LIMIT),
            offset.unwrap_or(0),
            filter,
            sort,
        )
        .await;
    }
    fetch_table_rows(
        connection_id,
        schema,
        table,
        limit.unwrap_or(DEFAULT_ROW_LIMIT),
        offset.unwrap_or(0),
        filter,
        sort,
    )
    .await
}

#[tauri::command]
async fn count_table(
    connection_id: String,
    schema: Option<String>,
    table: String,
    filter: Option<String>,
) -> Result<i64, String> {
    if mongo::is_connected(&connection_id) {
        return mongo::count_documents(connection_id, table, filter).await;
    }
    count_table_rows(connection_id, schema, table, filter).await
}

#[tauri::command]
async fn apply_mutations(
    connection_id: String,
    schema: Option<String>,
    table: String,
    mutations: Vec<RowMutation>,
) -> Result<u64, String> {
    if mongo::is_connected(&connection_id) {
        return mongo::apply_mutations(connection_id, table, mutations).await;
    }
    apply_row_mutations(connection_id, schema, table, mutations).await
}

// Runs one or more `;`-separated statements on the held connection, returning one outcome per
// statement. Cancellable by `request_id`. SQL only - the Mongo path uses execute_mongo_*.
#[tauri::command]
async fn execute_sql(
    connection_id: String,
    sql: String,
    request_id: String,
) -> Result<Vec<QueryOutcome>, String> {
    run_query(connection_id, sql, DEFAULT_ROW_LIMIT, request_id).await
}

// Runs one or more `;`-separated MongoDB Query-tab commands (`db.<coll>.find({...})` /
// `db.<coll>.aggregate([...])`), returning one outcome per command. Cancellable by `request_id`,
// mirroring `execute_sql`.
#[tauri::command]
async fn execute_mongo(
    connection_id: String,
    command: String,
    request_id: String,
) -> Result<Vec<QueryOutcome>, String> {
    mongo::run_query(connection_id, command, DEFAULT_ROW_LIMIT, request_id).await
}

#[tauri::command]
async fn cancel_query(request_id: String) {
    cancel_query_db(request_id).await
}

#[tauri::command]
async fn fetch_schema(connection_id: String) -> Result<Vec<TableSchema>, String> {
    if mongo::is_connected(&connection_id) {
        return mongo::fetch_schema(connection_id).await;
    }
    fetch_schema_db(connection_id).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    sqlx::any::install_default_drivers();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            logging::init(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            connect_database,
            disconnect_database,
            fetch_table,
            count_table,
            apply_mutations,
            execute_sql,
            execute_mongo,
            cancel_query,
            fetch_schema,
            logging::log_message
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::greet;

    #[test]
    fn should_greet_with_name_when_given_one() {
        assert_eq!(greet("World"), "Hello, World! Greetings from Tauri.");
    }

    #[test]
    fn should_greet_with_empty_name_when_name_is_blank() {
        assert_eq!(greet(""), "Hello, ! Greetings from Tauri.");
    }
}
