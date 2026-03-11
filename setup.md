# SQL Rely Setup Guide

This guide provides step-by-step instructions on how to clone, build, package, install, and run the SQL Rely Visual Studio Code extension.

## 1. Prerequisites

Before starting, ensure you have the following installed on your system:
*   [Node.js](https://nodejs.org/) (which includes npm)
*   [Visual Studio Code](https://code.visualstudio.com/)
*   The `mssql` (SQL Server) extension installed within VS Code.
*   Git (for cloning)

## 2. Clone the Repository

Clone the SQL Rely repository to your local machine:

```bash
git clone <repository_url>
cd sql-rely
```

## 3. Install Dependencies

Install the required npm packages. The project relies on `@types/vscode` for the extensibility API and `typescript` for compilation.

```bash
npm install
```

## 4. Build and Compile

Compile the TypeScript source code (`src/extension.ts`) into JavaScript (`out/extension.js`):

```bash
npm run compile
```

## 5. Package the Extension

To install the extension globally or share it, you need to package it into a `.vsix` file using the `vsce` (Visual Studio Code Extension) manager:

```bash
npx @vscode/vsce package
```

This will generate a file named `sql-rely-0.0.1.vsix` (version number may vary) in your current directory. It automatically bundles the `SQLCop Tests` and `tSQLt` installation files.

## 6. Install the Extension in VS Code

You can install the packaged `.vsix` file directly into VS Code from the command line:

```bash
code --install-extension sql-rely-0.0.1.vsix
```

Alternatively, you can install it via the VS Code UI:
1. Open the **Extensions** view (`Ctrl+Shift+X`).
2. Click the `...` (Views and More Actions) menu at the top right of the Extensions view.
3. Select **Install from VSIX...**.
4. Browse to and select the `sql-rely-0.0.1.vsix` file.

## 7. Running and Using SQL Rely

Once installed, follow these steps to use the extension:

1. **Reload VS Code**: Press `F1` or `Ctrl+Shift+P` to open the Command Palette and type **`Developer: Reload Window`**.
2. **Connect to a Database**: 
    * Open any `.sql` file in your workspace (or create a new empty one).
    * Look at the bottom right corner of the VS Code status bar. It should say "Disconnected". 
    * Click it to connect to your target SQL Server database using the `mssql` extension profile manager.
3. **Open Test Explorer**: Click the beaker icon (`⚗️`) in the left Activity Bar to open the Testing view.
4. **Install Frameworks**:
    * Open the Command Palette (`Ctrl+Shift+P`).
    * Run **`SQL Rely: Install tSQLt Framework`** to prepare your database for testing (Note: This requires `sa` or similar high-level privileges).
    * Run **`SQL Rely: Install SQLCop Tests`** to deploy the static analysis suite.
5. **Discover Tests**: The Test Explorer should automatically discover the newly installed tests. If not, click the "Refresh" icon at the top of the Testing view or run **`SQL Rely: Discover Tests Manually`**.
6. **Execute Tests**: Hover over a test class (like `SQLCop`) or individual test in the tree and click the "Play" button to run it. Results will appear inline.
7. **Create/Edit Tests**: 
    * To create a custom test, use the Command Palette: **`SQL Rely: Create New Test`**.
    * To edit any discovered test, right-click it in the Test Explorer tree and select **`Edit Test`**.
