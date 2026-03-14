# SQL Rely MCP Tools

This document outlines the tools provided by the SQL Rely Model Context Protocol (MCP) server. These tools allow GitHub Copilot to interact directly with your connected SQL database via the active VS Code extension.

## Available Tools

### 1. `run_sql_tests`
*   **Description**: Instructs the SQL Rely VS Code extension to execute your entire database test suite.
*   **How it works**: When invoked, the MCP server sends an instruction to the active SQL Rely instance in your editor. SQL Rely grabs your currently active database connection, executes the master test runner (e.g., `tSQLt.RunAll`), parses the results, and returns the Pass/Fail summary strings back to Copilot.
*   **Example Prompt**: *"Run all of my database tests."* or *"Can you run my SQL Rely tests and let me know the results?"*

### 2. `install_sqlcop`
*   **Description**: Automates the installation of the **SQLCop** framework directly into your connected database.
*   **How it works**: The VS Code extension reads a bundled directory containing `.sql` files for standard SQLCop health-check rules (e.g., missing primary keys, fragmented indexes). It instantly creates a `[SQLCop]` schema and executes the scripts to deploy all those test procedures to your database.
*   **Example Prompt**: *"I want to check my database health. Install the SQLCop tests via SQL Rely."*

### 3. `create_sql_test`
*   **Description**: Provides a highly structured T-SQL template for authoring a brand-new test case.
*   **How it works**: Copilot calls this tool to retrieve standard SQL testing boilerplate (complete with Arrange/Act/Assert structural comments). Copilot can then format it nicely in chat or immediately use it to fulfill a request to write a specific test, saving you from remembering exact syntax strings.
*   **Example Prompt**: *"Create a new SQL Rely test template for verifying that my [Customers] table rejects null emails."*
