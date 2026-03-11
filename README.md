# SQL Rely (Prototype)

SQL Rely is a prototype VS Code extension designed to bring database testing natively into the Visual Studio Code Test Explorer. It leverages the official `vscode-mssql` extension's API to manage database connections and execute test queries.

This document outlines the prerequisites, setup, and step-by-step instructions on how to run, debug, and develop this extension.

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

## Step-by-Step Guide: How to Run and Debug

Follow these steps to experience the extension in action.

### 1. Open the Project
Open a new instance of Visual Studio Code and open the `sql-rely` directory.
```bash
cd c:\Users\Naveen\Documents\projects\sql-rely
code .
```

### 2. Verify Dependencies
The dependencies should already be installed from the project scaffolding. If you ever need to reinstall them, run the following in the VS Code integrated terminal:
```bash
npm install
```

### 3. Launch the Extension Development Host
To debug the extension, you need to run it inside a special "Extension Development Host" window.
1.  Open the `src/extension.ts` file.
2.  Press **`F5`** on your keyboard (or click **Run** -> **Start Debugging** from the top menu).
3.  A new VS Code window will open. Notice the title bar says `[Extension Development Host]`. This is the sandbox environment where your custom `SQL Rely` extension is loaded.

### 4. Connect to a Database
Because `SQL Rely` depends on `vscode-mssql` for database connectivity, you must have an active connection *before* the tests can be discovered.
1. In the **Development Host** window, open an empty `.sql` file or create a new one (`Ctrl+N`, select language `SQL`).
2. At the bottom right in the Status Bar, click **Disconnected** (or press `Ctrl+Shift+C` / `Cmd+Shift+C`).
3. Follow the prompts to connect to your SQL Server database.

### 5. View and Run Tests
Once connected, `SQL Rely` will automatically discover the tests defined in your prototype.
1. Look at the Activity Bar on the far left of the VS Code window. Click on the **Testing icon** (it looks like a chemistry beaker).
2. You should now see "SQL Rely" populating the test tree with mock test classes (e.g., `tSQLt`, `FinancialTests`) and individual mock tests underneath them.
3. Click the **Play button** (▶️) next to the "SQL Rely" root node, a test class, or an individual test.
4. You will see the tests spin for about a second (simulating execution delay) and then visually update with a green checkmark (Pass) or a red X (Fail) directly in the sidebar!

## How to Continue Development

When making changes to the source code:
1. Make your changes in `src/extension.ts`.
2. In the parent VS Code window (where the debugger is running), press **`Ctrl+Shift+F5`** (or use the green restart icon on the debug toolbar) to restart the Development Host with your new changes applied.
3. The integrated TypeScript compiler handles recompiling your changes down to Javascript in the `out/` folder via the `npm run watch` (or `tsc -watch`) command usually hooked into the VS Code debug task.

### Modifying the Prototype Logic
Currently, the prototype uses mock data for discovery and execution. To connect this to a real testing framework like tSQLt:
*   **Discovery (`discoverTests` function)**: Change the mocked `UNION ALL` SQL string to query the database's `sys.procedures` system view, filtering for stored procedures that belong to specific schemas designating them as tests.
*   **Execution (`runHandler` function)**: Change the mocked `WAITFOR DELAY` query string to actually construct and execute the test runner string (e.g., `EXEC tSQLt.Run '${test.id}';`), capturing the true outcome based on the result set returned by `executeSimpleQuery()`.
