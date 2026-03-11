# SQL Rely Architecture

SQL Rely is natively built to integrate static analysis and unit testing tools like SQLCop and tSQLt into the Visual Studio Code environment. It heavily leverages standard capabilities of the VS Code Extensibility APIs to deliver its features.

## High-Level Architecture

The extension has two primary interaction points:
1. **VS Code Native Testing API (`vscode.tests`)**
2. **VS Code MSSQL Extension Connection Sharing (`api.connectionSharing`)**

### 1. The Test Controller

SQL Rely uses a `vscode.TestController` as its core UI foundation. This controller provides the native VS Code "Testing" sidebar (the beaker icon). 

*   **Test Items**: Tests are modeled as `TestItem` objects.
*   **Hierarchy**: Tests are grouped first by their schema (`TestClass`), then by the individual test procedure (`TestRun`). 
*   **Test Runs**: When a user triggers test execution via the UI, a `TestRun` object is spawned. SQL Rely iterates over this queue and executes the tests. The results (pass, fail, duration, and error messages) are piped directly back to the `TestRun` object, which colors the UI nodes Green (Pass) or Red (Fail).

### 2. Database Interaction (vscode-mssql Integration)

SQL Rely does *not* manage database connections directly. Instead, it relies on the official Microsoft `vscode-mssql` extension.

*   **Connection Discovery**: The user must open a `.sql` file and connect it to a database using the `vscode-mssql` tools at the bottom right of the editor.
*   **API Sharing**: SQL Rely requests the exported `mssql` API interface (`vscode.extensions.getExtension('ms-mssql.mssql')`).
*   **Execution Hooks**: It utilizes `api.connectionSharing.executeSimpleQuery(editorUri, query)` to fire ad-hoc queries securely over the established connection pool belonging to the active `.sql` window.

## Feature Workflows

### A. Installation Workflows (tSQLt and SQLCop)

The `tSQLt` and `SQLCop` framework files are physically bundled inside the `.vsix` extension package.

When activated, SQL Rely:
1. Reads the physical SQL files from disk.
2. In the case of `tSQLt`, pre-processes the source to replace short-lived temporary `#Procedures` with persisting installer scripts to overcome asynchronous connection pooling resets.
3. Splits the script into batches by the `GO` keyword.
4. Executes the batches sequentially against the database to mount the frameworks.
5. In the case of `tSQLt`, automatically runs `EXEC tSQLt.EnableExternalAccess @enable = 0` to bypass newer CLR Strict Security constraints.

### B. Discovery Workflow

When the Test Explorer is opened or refreshed, SQL Rely:
1. Validates that an active `mssql` connection exists on an open editor.
2. Executes a dynamic query: `SELECT s.name AS SchemaName, p.name AS ObjectName FROM sys.procedures p INNER JOIN sys.schemas s ON p.schema_id = s.schema_id WHERE p.name LIKE 'test%' ORDER BY s.name, p.name;`.
3. Maps these returned procedures into the UI.

### C. Execution Workflow

When a user clicks "Play":
1. The extension parses the `TestItem` ID to extract the `[SchemaName]` and `[ObjectName]`.
2. It executes the query `EXEC tSQLt.Run '[SchemaName].[ObjectName]'`. 
    * *Note: Using `tSQLt.Run` is mandatory, as executing the raw procedure directly circumvents the tSQLt transaction isolation and `#TestMessage` temporary tables.*
3. It intercepts any exceptions thrown back by `tSQLt.Fail`.
4. It parses the SQL Server wrapper noise off the exception and pipes the raw failure message directly to the inline editor overlay via `run.failed()`.

### D. Scaffold and Edit Workflows

1. **Create New Test**: Uses `showInputBox` to capture metadata and uses `vscode.workspace.openTextDocument` to generate the `CREATE OR ALTER PROCEDURE` boilerplate in memory.
2. **Edit Test**: Queries `sys.sql_modules` for the existing `definition` text of the test procedure, uses a RegEx replacement to bump standard `CREATE PROCEDURE` into `CREATE OR ALTER PROCEDURE` for easy redeployment, and opens it into an active editor view.
