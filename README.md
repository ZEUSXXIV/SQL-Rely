# SQL Rely - v1

> ⚡ **Forged by ZEUSXXIV** ⚡

A Visual Studio Code extension designed to bring powerful native SQL unit testing directly into your IDE. 

SQL Rely leverages the official `vscode-mssql` extension to connect to your databases natively, allowing you to seamlessly integrate static analysis tests (SQLCop) and robust unit testing (tSQLt) directly into your VS Code testing workflow.

## Features

*   **Native VS Code Test Explorer**: Tests are dynamically discovered, grouped by schema, and displayed inside the native VS Code Testing sidebar (`⚗️`).
*   **One-Click Installation (`SQL Rely: Install tSQLt Framework`)**: Installs the tSQLt unit testing framework into your connected database effortlessly. Automatic cleanup and robust handling of CLR security and async connection pooling.
*   **SQLCop Integration (`SQL Rely: Install SQLCop Tests`)**: Bundles and deploys 48 static analysis tests developed by SQLCop as persistent stored procedures into your database.
*   **Test Scaffolding (`SQL Rely: Create New Test`)**: Prompts for a Schema and Name, then scaffolds a `CREATE OR ALTER PROCEDURE` template.
*   **Native Edit Support**: Right-click any test in the Test Explorer and select **`Edit Test`** to query its definition and open it natively in a new editor tab for rapid modifications.
*   **Direct Execution**: Click the "Play" button on any test or group to execute them. Uses the `tSQLt.Run` handler to display inline pass/fail results directly in the code!
*   **Execution (`runHandler` function)**: Change the mocked `WAITFOR DELAY` query string to actually construct and execute the test runner string (e.g., `EXEC tSQLt.Run '${test.id}';`), capturing the true outcome based on the result set returned by `executeSimpleQuery()`.

## GitHub Copilot MCP Integration

SQL Rely includes a built-in Model Context Protocol (MCP) server that allows GitHub Copilot Chat in VS Code to interact with your databases directly. Copilot can create SQL test templates, run your test suite, and automatically install SQLCop scripts using your active database connection.

### How to Configure

1. Ensure the `sql-rely` workspace is compiling correctly (`npm run compile`) so that `out/mcp-server.js` exists.
2. Ensure you have the Extension Development Host running your extension (or install it properly) and an active SQL database connection open.
3. Open your overarching VS Code User Settings (JSON) by running the command `Preferences: Open User Settings (JSON)`.
4. Register the stdio MCP server in your `settings.json`:

```json
{
  "github.copilot.chat.mcp.enabled": true,
  "github.copilot.mcp.servers": {
    "sql-rely-mcp": {
      "command": "node",
      "args": [
        "c:/Users/Naveen/Documents/projects/sql-rely/out/mcp-server.js"
      ]
    }
  }
}
```

5. Reload VS Code (or click "Relaunch MCP Servers" in the MCP panel).
6. In GitHub Copilot Chat, you can now invoke it by asking:
   - *"Run my SQL Rely database tests."*
   - *"Install SQLCop tools to my database via SQL Rely."*
   - *"Create a new tSQLt test case."*

## Documentation

*   [**Setup & Usage Guide**](setup.md): Step-by-step instructions on how to build, install, and run this extension.
*   [**Architecture & Design**](architecture.md): Learn how the extension proxies connection and execution requests via the `api.connectionSharing` hooks.

## Prerequisites

Before you can run or develop this extension, ensure your environment meets the following requirements:

1.  **Visual Studio Code**: Ensure you have the latest version of VS Code installed.
2.  **Node.js**: You need Node.js (v18 or higher recommended) to run the extension build scripts. [Download Node.js](https://nodejs.org/).
3.  **MSSQL Extension**: You must have the official [SQL Server (mssql)](https://marketplace.visualstudio.com/items?itemName=ms-mssql.mssql) extension installed in VS Code.
4.  **SQL Server Instance**: You need access to a SQL Server database (LocalDB, Docker container, Azure SQL, or a traditional on-premises instance) to connect to.

## Project Structure

*   `src/extension.ts`: The main entry point for the extension. Contains the logic for the Test Controller and interaction with the `vscode-mssql` API.
*   `src/mssql.d.ts`: Typings file that defines the API surface of the `vscode-mssql` extension, allowing for TypeScript intellisense.
*   `package.json`: Extension manifest declaring dependencies (`ms-mssql.mssql`), contribution points (commands, UI elements), and required scripts.
