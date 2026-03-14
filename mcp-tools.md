# SQL Rely MCP Tools Reference

This document provides a detailed overview of the tools provided by the SQL Rely Model Context Protocol (MCP) server. These tools enable AI assistants (like Claude or GitHub Copilot) to discover, execute, and author database tests directly within your VS Code environment.

---

## 🏗️ Test Execution Tools

### 1. `run_sql_tests`
*   **Description**: Executes all tSQLt tests in the currently active database.
*   **Parameters**: None.
*   **Behavior**: Automatically detects schemas with test procedures, promotes them to test classes if necessary, and runs `tSQLt.RunAll`. Returns a grouped summary of Passed, Failed, and Errored tests with detailed failure reasons.
*   **Example**: *"Run all database tests."*

### 2. `run_sql_test`
*   **Description**: Executes a specific tSQLt test case by name.
*   **Parameters**: 
    - `testName` (string): The full name of the test (e.g., `[MySchema].[test_MyTest]`).
*   **Behavior**: Runs `tSQLt.Run` for the specific test. Returns a detailed report including execution status and database failure messages.
*   **Example**: *"Run the test [SQLCop].[test Max degree of parallelism]."*

---

## 🔍 Discovery & Authoring Tools

### 3. `list_sql_tests`
*   **Description**: Retrieves a structured list of all registered tSQLt test classes and their individual test cases.
*   **Parameters**: None.
*   **Behavior**: Queries the database for schemas with the `tSQLt.TestClass` property and returns a list of matching procedures.
*   **Example**: *"What tests do I have in my database?"*

### 4. `create_test_class`
*   **Description**: Bootstraps a new tSQLt Test Class (Schema).
*   **Parameters**: 
    - `className` (string): The name of the new test class.
*   **Behavior**: Executes `tSQLt.NewTestClass`, preparing a schema to host new tests.
*   **Example**: *"Create a new test class named AccountsTests."*

### 5. `create_sql_test`
*   **Description**: Generates a standardized T-SQL template for a new test procedure.
*   **Parameters**: 
    - `className` (string): The target test class name.
    - `testName` (string): The name of the new test (must start with `test`).
*   **Behavior**: Returns a `CREATE PROCEDURE` snippet with Arrange, Act, and Assert boilerplate.
*   **Example**: *"Generate a template for a test named [test_BalanceCheck] in the [Accounts] class."*

### 6. `deploy_sql_test`
*   **Description**: Deploys/Commits a test procedure directly to the database.
*   **Parameters**: 
    - `sqlCode` (string): The full T-SQL code of the procedure.
*   **Behavior**: Executes the provided code in the database. If successful, it triggers a refresh of the VS Code Test Explorer.
*   **Example**: AI writes the code, then calls this tool to save it.

---

## 🛠️ Management Tools

### 7. `install_sqlcop`
*   **Description**: Installs the standard SQLCop health-check test suite.
*   **Parameters**: None.
*   **Behavior**: Deploys the `[SQLCop]` schema and dozens of best-practice tests (e.g., Fragmented Indexes, Missing Primary Keys).
*   **Example**: *"Install SQLCop tests to check my database architecture."*

---

## 💡 Best Practices
- **Active Connection**: All tools require a `.sql` file to be open and connected in VS Code to provide the database context.
- **Diagnostics**: If a tool fails (500 Error), check the **"SQL Rely" Output Channel** in VS Code for detailed T-SQL exception logs.
- **Namespace**: tSQLt tests MUST reside in a valid test class and names MUST start with `test` to be discoverable.
