import * as vscode from 'vscode';
import { IExtension } from './mssql';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as os from 'os';

let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('SQL Rely');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('SQL Rely activated! Waiting for workspace or file...');

    // Create the Native VS Code Test Controller
    const ctrl = vscode.tests.createTestController('sqlRelyController', 'SQL Rely');
    context.subscriptions.push(ctrl);

    // Get the MSSQL extension API
    const mssqlExt = vscode.extensions.getExtension<IExtension>('ms-mssql.mssql');
    if (!mssqlExt) {
        vscode.window.showErrorMessage('MSSQL extension required for SQL Rely');
        return;
    }

    const mssqlApi = await mssqlExt.activate();

    // Hook up discovery
    ctrl.refreshHandler = async () => {
        await discoverTests(ctrl, mssqlApi);
    };

    ctrl.resolveHandler = async (item) => {
        if (!item) {
            await discoverTests(ctrl, mssqlApi);
        }
    };

    // Hook up execution
    const runProfile = ctrl.createRunProfile('Run SQL Tests', vscode.TestRunProfileKind.Run, (request, token) => {
        runHandler(request, token, ctrl, mssqlApi);
    });

    // Provide handy commands
    context.subscriptions.push(vscode.commands.registerCommand('sql-rely.runTests', () => {
        outputChannel.appendLine('Running testing.runAll command...');
        vscode.commands.executeCommand('testing.runAll');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('sql-rely.discoverTests', async () => {
        outputChannel.appendLine('Manually triggered discovery...');
        await discoverTests(ctrl, mssqlApi);
        outputChannel.show(); // Show the logs when manually triggered
    }));

    context.subscriptions.push(vscode.commands.registerCommand('sql-rely.installSqlCop', async () => {
        outputChannel.appendLine('Manually triggered install SQLCop...');
        await installSqlCopTests(mssqlApi, context);
        outputChannel.show();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('sql-rely.createTest', async () => {
        outputChannel.appendLine('Manually triggered create Test...');
        await createNewTest();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('sql-rely.installTsqlt', async () => {
        outputChannel.appendLine('Manually triggered install tSQLt...');
        await installTsqltFramework(mssqlApi, context);
        outputChannel.show();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('sql-rely.editTest', async (item: vscode.TestItem) => {
        outputChannel.appendLine(`Manually triggered edit Test...`);
        if (item) {
            await editExistingTest(item, mssqlApi);
        } else {
            vscode.window.showErrorMessage("Please right-click a test in the Test Explorer to edit it.");
        }
    }));
    
    // Start local HTTP server for MCP
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            if (req.url === '/runTests' && req.method === 'POST') {
                outputChannel.appendLine('MCP requested test execution. Running...');
                try {
                    // Find an open SQL document to serve as the connection context
                    let editorUri = vscode.window.activeTextEditor?.document.uri.toString();
                    if (!editorUri || !editorUri.endsWith('.sql')) {
                        const sqlDoc = vscode.workspace.textDocuments.find(d => d.languageId === 'sql');
                        if (sqlDoc) {
                            editorUri = sqlDoc.uri.toString();
                        }
                    }

                    if (!editorUri) {
                        res.writeHead(400);
                        res.end('No active SQL connection detected to run tests. Please ensure a connected .sql file is open in the background.');
                        return;
                    }

                    // Directly execute tSQLt.RunAll
                    const query = `EXEC tSQLt.RunAll;`;
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    
                    try {
                        let activeDb = '(unknown)';
                        try {
                            activeDb = mssqlApi.connectionSharing.getActiveDatabase(editorUri) || activeDb;
                        } catch (e) {
                            outputChannel.appendLine(`Could not get active database name: ${e}`);
                        }

                        // Step 1: Detect all schemas that contain procedures starting with 'test'
                        const discoveryQuery = `
                            SELECT DISTINCT s.name 
                            FROM sys.procedures p 
                            INNER JOIN sys.schemas s ON p.schema_id = s.schema_id 
                            WHERE p.name LIKE 'test%';
                        `;
                        const discoveryResult = await mssqlApi.connectionSharing.executeSimpleQuery(editorUri, discoveryQuery);
                        
                        if (!discoveryResult || !discoveryResult.rows || discoveryResult.rows.length === 0) {
                            res.end(`No test procedures (starting with 'test%') were found in database: [${activeDb}].`);
                            return;
                        }

                        // Step 2: Check if tSQLt is installed
                        const tsqltCheckQuery = `SELECT OBJECT_ID('tSQLt.RunAll') AS RunAllId, OBJECT_ID('tSQLt.NewTestClass') AS NewTestClassId;`;
                        const tsqltCheck = await mssqlApi.connectionSharing.executeSimpleQuery(editorUri, tsqltCheckQuery);
                        const hasRunAll = tsqltCheck && tsqltCheck.rows && tsqltCheck.rows[0][0] !== null;

                        if (!hasRunAll) {
                            res.end(`Detected ${discoveryResult.rows.length} test schemas, but the tSQLt framework does not appear to be installed in [${activeDb}]. Please run 'Install tSQLt Framework' first.`);
                            return;
                        }

                        // Step 3: Auto-register schemas as test classes if they aren't already
                        // Step 3a: Detection of existing non-test-class schemas
                        for (const row of discoveryResult.rows) {
                            const schemaName = row[0].displayValue || row[0];
                            const promotionQuery = `
                                IF NOT EXISTS (
                                    SELECT 1 FROM sys.extended_properties 
                                    WHERE class_desc = 'SCHEMA' 
                                      AND major_id = SCHEMA_ID('${schemaName}') 
                                      AND name = 'tSQLt.TestClass'
                                )
                                BEGIN
                                    -- Schema exists but is not marked as a test class.
                                    -- Promotion: Add the extended property manually to avoid tSQLt.NewTestClass conflict.
                                    -- This is safer than NewTestClass if the schema already contains procedures.
                                    EXEC sp_addextendedproperty 
                                        @name = N'tSQLt.TestClass', 
                                        @value = 1, 
                                        @level0type = N'SCHEMA', 
                                        @level0name = '${schemaName}';
                                END
                            `;
                            try {
                                await mssqlApi.connectionSharing.executeSimpleQuery(editorUri, promotionQuery);
                                outputChannel.appendLine(`Safe promotion: Registered [${schemaName}] as tSQLt Test Class.`);
                            } catch (e: any) {
                                outputChannel.appendLine(`Warning during schema promotion for [${schemaName}]: ${e.message}`);
                            }
                        }

                        // Step 4: Run the tests!
                        const result = await mssqlApi.connectionSharing.executeSimpleQuery(editorUri, query);
                        
                        // Parse the result set for tSQLt results 
                        let passed = 0;
                        let failed = 0;
                        let errors = 0;
                        
                        if (result && result.rows) {
                            for (const row of result.rows) {
                                const rowString = JSON.stringify(row).toLowerCase();
                                if (rowString.includes('success')) passed++;
                                else if (rowString.includes('failure')) failed++;
                                else if (rowString.includes('error')) errors++;
                            }
                        }
                        
                        let summary = `SQL Rely Test Execution Summary for [${activeDb}]:\\n`;
                        summary += `✅ Passed: ${passed}\\n`;
                        summary += `❌ Failed: ${failed}\\n`;
                        if (errors > 0) summary += `⚠️ Errors: ${errors}\\n`;
                        
                        if (passed === 0 && failed === 0 && errors === 0) {
                            summary += `\\n(Note: Tests were executed but no success/failure counts could be parsed. Check the SQL Rely output channel for details.)`;
                        } else {
                            summary += `\\n(Note: You can view detailed failure messages directly in the VS Code Test Explorer sidebar!)`;
                        }

                        res.end(summary);

                        // Also trigger the UI so the user sees the visual update in the sidebar immediately!
                        vscode.commands.executeCommand('testing.runAll');

                    } catch(err: any) {
                        res.end(`Database Test Execution Failed: ${err.message}`);
                    }

                } catch(e: any) {
                     res.writeHead(500);
                     res.end(`Internal Error: ${e.message}`);
                }
            } else if (req.url === '/installSqlCop' && req.method === 'POST') {
                vscode.commands.executeCommand('sql-rely.installSqlCop');
                res.writeHead(200);
                res.end('Install SQLCop command triggered in VS Code.');
            } else if (req.url === '/createTest' && req.method === 'POST') {
                const template = "CREATE PROCEDURE [tSQLt].[test_MyNewTest]\\nAS\\nBEGIN\\n\\t-- Arrange\\n\\t-- Act\\n\\t-- Assert\\n\\tEXEC tSQLt.Fail 'Test not implemented';\\nEND";
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(template);
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        });
    });

    server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address !== 'string') {
            const portFile = path.join(os.tmpdir(), '.sql-rely.port');
            fs.writeFileSync(portFile, address.port.toString());
            outputChannel.appendLine(`MCP backend listening on port ${address.port} (saved to ${portFile})`);
        }
    });

    context.subscriptions.push({ dispose: () => server.close() });

    outputChannel.appendLine('Activation complete.');
}

async function installSqlCopTests(api: any, context: vscode.ExtensionContext) {
    outputChannel.appendLine('installSqlCopTests called');
    try {
        if (!api || !api.connectionSharing) {
            vscode.window.showErrorMessage('SQL Rely Error: Cannot install tests, connectionSharing API is missing.');
            return;
        }

        let editorUri = vscode.window.activeTextEditor?.document.uri.toString();
        if (!editorUri || !editorUri.endsWith('.sql')) {
            const sqlDoc = vscode.workspace.textDocuments.find(d => d.languageId === 'sql');
            if (sqlDoc) {
                editorUri = sqlDoc.uri.toString();
            }
        }

        if (!editorUri) {
            vscode.window.showErrorMessage(
                'No active SQL document found to deploy tests against.',
                'Got It'
            );
            return;
        }

        // Check if SQLCop tests directory exists
        const testsDir = path.join(context.extensionPath, 'SQLCop Tests');
        if (!fs.existsSync(testsDir)) {
            vscode.window.showErrorMessage(`SQLCop Tests folder not found at ${testsDir}`);
            return;
        }

        const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.sql'));
        if (files.length === 0) {
            vscode.window.showErrorMessage('No .sql files found in SQLCop Tests folder.');
            return;
        }

        // Create schema first (using NewTestClass if tSQLt is present)
        const createSchemaQuery = `
            IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'SQLCop')
            BEGIN
                IF OBJECT_ID('tSQLt.NewTestClass') IS NOT NULL
                BEGIN
                    EXEC tSQLt.NewTestClass 'SQLCop';
                END
                ELSE
                BEGIN
                    EXEC('CREATE SCHEMA [SQLCop]');
                END
            END
            ELSE IF OBJECT_ID('tSQLt.NewTestClass') IS NOT NULL AND NOT EXISTS (
                 SELECT 1 FROM sys.extended_properties 
                 WHERE class_desc = 'SCHEMA' 
                   AND major_id = SCHEMA_ID('SQLCop') 
                   AND name = 'tSQLt.TestClass'
            )
            BEGIN
                -- Promote existing non-test SQLCop schema
                EXEC sp_addextendedproperty 
                    @name = N'tSQLt.TestClass', 
                    @value = 1, 
                    @level0type = N'SCHEMA', 
                    @level0name = 'SQLCop';
            END
        `;
        outputChannel.appendLine('Ensuring SQLCop test class/schema exists...');
        await api.connectionSharing.executeSimpleQuery(editorUri, createSchemaQuery);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Installing SQLCop Tests",
            cancellable: true
        }, async (progress, token) => {
            let i = 0;
            for (const file of files) {
                if (token.isCancellationRequested) {
                    break;
                }
                const progressPercentage = (i / files.length) * 100;
                progress.report({ increment: progressPercentage, message: `Deploying ${file}...` });
                outputChannel.appendLine(`Deploying ${file}...`);

                const fullPath = path.join(testsDir, file);
                let content = fs.readFileSync(fullPath, 'utf8');
                
                // Replace ALTER PROCEDURE with CREATE OR ALTER PROCEDURE
                // We use a regex to ensure we match it case-insensitively
                content = content.replace(/ALTER\s+PROCEDURE/ig, 'CREATE OR ALTER PROCEDURE');
                
                try {
                    await api.connectionSharing.executeSimpleQuery(editorUri, content);
                } catch (err: any) {
                    outputChannel.appendLine(`Error deploying ${file}: ${err.message}`);
                }
                i++;
            }
        });

        vscode.window.showInformationMessage(`Successfully installed ${files.length} SQLCop tests! Run Discovery to see them.`);
    } catch (err: any) {
        outputChannel.appendLine(`Install failed: ${err.message || String(err)}`);
        vscode.window.showErrorMessage("SQL Rely: Installation failed. Error: " + (err.message || String(err)));
    }
}

async function installTsqltFramework(api: any, context: vscode.ExtensionContext) {
    outputChannel.appendLine('installTsqltFramework called');
    try {
        if (!api || !api.connectionSharing) {
            vscode.window.showErrorMessage('SQL Rely Error: Cannot install tSQLt, connectionSharing API is missing.');
            return;
        }

        let editorUri = vscode.window.activeTextEditor?.document.uri.toString();
        if (!editorUri || !editorUri.endsWith('.sql')) {
            const sqlDoc = vscode.workspace.textDocuments.find(d => d.languageId === 'sql');
            if (sqlDoc) { editorUri = sqlDoc.uri.toString(); }
        }

        if (!editorUri) {
            vscode.window.showErrorMessage('No active SQL document found to deploy tSQLt against.', 'Got It');
            return;
        }

        const tsqltDir = path.join(context.extensionPath, 'tSQLt');
        if (!fs.existsSync(tsqltDir)) {
            vscode.window.showErrorMessage(`tSQLt folder not found at ${tsqltDir}.`);
            return;
        }

        const files = ['PrepareServer.sql', 'tSQLt.class.sql'];
        
        try {
            outputChannel.appendLine('Cleaning up any previous or aborted tSQLt installation...');
            const cleanupQuery = `
                IF OBJECT_ID('tSQLt.Uninstall') IS NOT NULL 
                BEGIN
                    EXEC tSQLt.Uninstall;
                END
                ELSE IF EXISTS (SELECT * FROM sys.schemas WHERE name = 'tSQLt')
                BEGIN
                    DECLARE @sql NVARCHAR(MAX) = '';
                    -- Drop all routines (functions, procedures)
                    SELECT @sql += 'DROP ' + CASE type WHEN 'P' THEN 'PROCEDURE' WHEN 'V' THEN 'VIEW' ELSE 'FUNCTION' END + ' [tSQLt].[' + name + '];'
                    FROM sys.objects WHERE schema_id = SCHEMA_ID('tSQLt') AND type IN ('P', 'V', 'FN', 'IF', 'TF');
                    EXEC sp_executesql @sql;
                    
                    -- Drop all tables
                    SET @sql = '';
                    SELECT @sql += 'DROP TABLE [tSQLt].[' + name + '];'
                    FROM sys.objects WHERE schema_id = SCHEMA_ID('tSQLt') AND type = 'U';
                    EXEC sp_executesql @sql;
                    
                    DROP SCHEMA tSQLt;
                END
            `;
            await api.connectionSharing.executeSimpleQuery(editorUri, cleanupQuery);
        } catch (e: any) {
            outputChannel.appendLine(`Cleanup warning (can usually be ignored): ${e.message}`);
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Installing tSQLt Framework",
            cancellable: true
        }, async (progress, token) => {
            
            for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
                const file = files[fileIdx];
                const fullPath = path.join(tsqltDir, file);
                
                if (!fs.existsSync(fullPath)) {
                    outputChannel.appendLine(`File missing: ${fullPath}`);
                    continue;
                }

                outputChannel.appendLine(`Parsing ${file}...`);
                let content = fs.readFileSync(fullPath, 'utf8');
                
                if (file === 'PrepareServer.sql') {
                    // Replace local temporary procs with permanent ones to survive connection pooling across batches
                    content = content.replace(/tempdb\.\.#/g, 'tSQLt_Install_');
                    content = content.replace(/#/g, 'tSQLt_Install_');
                    
                    content += '\nGO\nIF OBJECT_ID(\'tSQLt_Install_Private_GetAssemblyKeyBytes\') IS NOT NULL DROP PROCEDURE tSQLt_Install_Private_GetAssemblyKeyBytes;';
                    content += '\nGO\nIF OBJECT_ID(\'tSQLt_Install_Private_EnableCLR\') IS NOT NULL DROP PROCEDURE tSQLt_Install_Private_EnableCLR;';
                    content += '\nGO\nIF OBJECT_ID(\'tSQLt_Install_Private_GetSQLProductMajorVersion\') IS NOT NULL DROP PROCEDURE tSQLt_Install_Private_GetSQLProductMajorVersion;';
                    content += '\nGO\nIF OBJECT_ID(\'tSQLt_Install_RemoveAssemblyKey\') IS NOT NULL DROP PROCEDURE tSQLt_Install_RemoveAssemblyKey;';
                    content += '\nGO\nIF OBJECT_ID(\'tSQLt_Install_InstallAssemblyKey\') IS NOT NULL DROP PROCEDURE tSQLt_Install_InstallAssemblyKey;';
                    content += '\nGO\nIF OBJECT_ID(\'tSQLt_Install_PrepareServer\') IS NOT NULL DROP PROCEDURE tSQLt_Install_PrepareServer;\nGO\n';
                }

                // Split by "GO" on its own line
                const batches = content.split(/^(?:GO|go)[\r\n]*$/m)
                    .map(b => b.trim())
                    .filter(b => b.length > 0);

                outputChannel.appendLine(`Found ${batches.length} batches in ${file}. Executing...`);

                let batchIdx = 0;
                for (const batch of batches) {
                    if (token.isCancellationRequested) break;
                    
                    batchIdx++;
                    const progressPercentage = ((fileIdx * 50) + ((batchIdx / batches.length) * 50));
                    progress.report({ increment: 0, message: `Deploying ${file} (${batchIdx}/${batches.length} batches)...` });
                    
                    try {
                        await api.connectionSharing.executeSimpleQuery(editorUri, batch);
                    } catch (err: any) {
                        outputChannel.appendLine(`FATAL: Error deploying batch ${batchIdx} of ${file}: ${err.message}`);
                        throw new Error(`Failed to deploy ${file} on batch ${batchIdx}. SQL Error: ${err.message}`);
                    }
                }
            }
        });
        
        outputChannel.appendLine('Configuring CLR External Access for tSQLt...');
        try {
            await api.connectionSharing.executeSimpleQuery(editorUri, 'EXEC tSQLt.EnableExternalAccess @enable = 0;');
        } catch (err: any) {
             outputChannel.appendLine(`Warning setting CLR Access: ${err.message}`);
             // Don't fail the whole install, sometimes this isn't strictly necessary or errors if sa privileges are missing
        }

        vscode.window.showInformationMessage(`Successfully installed the tSQLt Framework!`);
    } catch (err: any) {
        outputChannel.appendLine(`Install tSQLt failed: ${err.message || String(err)}`);
        vscode.window.showErrorMessage("SQL Rely: tSQLt Installation failed. Error: " + (err.message || String(err)));
    }
}

async function createNewTest() {
    const testClass = await vscode.window.showInputBox({
        prompt: 'Enter the Test Class (Schema) name',
        placeHolder: 'e.g., tSQLt, SQLCop, FinancialTests',
        value: 'SQLCop'
    });

    if (!testClass) { return; } // User cancelled

    const testName = await vscode.window.showInputBox({
        prompt: 'Enter the Test Name',
        placeHolder: 'e.g., test My New Feature'
    });

    if (!testName) { return; } // User cancelled

    // Ensure test name starts with "test" for tSQLt convention
    let finalTestName = testName.trim();
    if (!finalTestName.toLowerCase().startsWith('test')) {
        finalTestName = 'test ' + finalTestName;
    }

    const template = `
-- =============================================
-- Test Class: [${testClass}]
-- Test Name:  [${finalTestName}]
-- =============================================
CREATE OR ALTER PROCEDURE [${testClass}].[${finalTestName}]
AS
BEGIN
    -- Assemble
    -- TODO: Setup fake tables and test data here

    -- Act
    -- TODO: Execute the code being tested here

    -- Assert
    -- TODO: Use tSQLt.Assert... or EXEC tSQLt.Fail 'Message' to verify results
    EXEC tSQLt.Fail 'TODO: Implement this test.';
END;
GO
`;

    // Open it in a new unsaved editor
    const document = await vscode.workspace.openTextDocument({
        language: 'sql',
        content: template.trim()
    });
    
    await vscode.window.showTextDocument(document);
}

async function editExistingTest(test: vscode.TestItem, api: any) {
    try {
        if (!api || !api.connectionSharing) {
            vscode.window.showErrorMessage('SQL Rely Error: Cannot edit tests, connectionSharing API is missing.');
            return;
        }

        let editorUri = vscode.window.activeTextEditor?.document.uri.toString();
        if (!editorUri || !editorUri.endsWith('.sql')) {
            const sqlDoc = vscode.workspace.textDocuments.find(d => d.languageId === 'sql');
            if (sqlDoc) { editorUri = sqlDoc.uri.toString(); }
        }

        if (!editorUri) {
            vscode.window.showErrorMessage('No active SQL document found to connect to the database.', 'Got It');
            return;
        }

        const parts = test.id.split('.');
        if (parts.length !== 2) {
            vscode.window.showErrorMessage(`Cannot parse schema and generic test name from ID: ${test.id}`);
            return;
        }

        const schemaName = parts[0];
        const objectName = parts[1];

        const query = `
            SELECT definition 
            FROM sys.sql_modules 
            WHERE object_id = OBJECT_ID('[${schemaName}].[${objectName}]');
        `;

        const result = await api.connectionSharing.executeSimpleQuery(editorUri, query);
        
        let definition = '';
        if (result && result.rows && result.rows.length > 0) {
            definition = result.rows[0][0].displayValue || result.rows[0][0];
            
            // Rewrite standard CREATE PROCEDURE to CREATE OR ALTER PROCEDURE
            // so the user can easily deploy changes without having to manually type it.
            // Using a case-insensitive regex to handle variations in whitespace.
            definition = definition.replace(/CREATE\s+PROCEDURE/i, 'CREATE OR ALTER PROCEDURE');
            definition = definition.replace(/CREATE\s+PROC/i, 'CREATE OR ALTER PROCEDURE');
        } else {
            vscode.window.showErrorMessage(`Could not find definition for ${test.id}`);
            return;
        }

        const document = await vscode.workspace.openTextDocument({
            language: 'sql',
            content: definition
        });
        
        await vscode.window.showTextDocument(document);

    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to open test for editing: ${err.message || String(err)}`);
    }
}

async function discoverTests(ctrl: vscode.TestController, api: any) {
    outputChannel.appendLine('discoverTests called');
    try {
        // Clear existing tests
        ctrl.items.forEach(i => ctrl.items.delete(i.id));

        if (!api) {
            vscode.window.showErrorMessage('SQL Rely Error: API is undefined');
            return;
        }

        if (!api.connectionSharing) {
            let apiStructure = Object.keys(api).join(', ');
            vscode.window.showErrorMessage('SQL Rely Error: connectionSharing missing. API keys: ' + apiStructure);
            return;
        }

        // The vscode-mssql extension expects the document URI of the active connected SQL file,
        // not the connection string ID, for executeSimpleQuery.
        let editorUri = vscode.window.activeTextEditor?.document.uri.toString();
        
        // Fallback to finding any open SQL document if active isn't SQL
        if (!editorUri || !editorUri.endsWith('.sql')) {
            const sqlDoc = vscode.workspace.textDocuments.find(d => d.languageId === 'sql');
            if (sqlDoc) {
                editorUri = sqlDoc.uri.toString();
            }
        }

        outputChannel.appendLine(`Got editorUri: ${editorUri}`);

        if (!editorUri) {
            outputChannel.appendLine('No editorUri found. Suggesting user opens a .sql file.');
            const item = ctrl.createTestItem('not-connected', 'No active SQL document detected. Open a connected .sql file.');
            ctrl.items.add(item);
            
            vscode.window.showInformationMessage(
                'SQL Rely: Open a .sql file and connect it to a database first.',
                'Got It'
            );
            return;
        }

        // Execute a dynamic discovery query
        // According to tSQLt conventions, test classes are schemas, and tests are procedures 
        // starting with 'test' within that schema.
        const query = `
            SELECT 
                s.name AS SchemaName,
                p.name AS ObjectName
            FROM sys.procedures p
            INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
            WHERE p.name LIKE 'test%'
            ORDER BY s.name, p.name;
        `;

        outputChannel.appendLine(`Executing simple query on ${editorUri}...`);
        const result = await api.connectionSharing.executeSimpleQuery(editorUri, query);
        outputChannel.appendLine(`Query returned result. Rows: ${result?.rows?.length}`);
        if (result && result.rows) {
            for (const row of result.rows) {
                const schema = row[0].displayValue || row[0];
                const name = row[1].displayValue || row[1];
                
                let parent = ctrl.items.get(schema);
                if (!parent) {
                    parent = ctrl.createTestItem(schema, schema);
                    parent.tags = [{ id: 'class' }];
                    ctrl.items.add(parent);
                }

                const testItem = ctrl.createTestItem(`${schema}.${name}`, name);
                parent.children.add(testItem);
            }
        }
        outputChannel.appendLine('Discovery completed successfully.');
    } catch (err: any) {
        outputChannel.appendLine(`Discovery failed: ${err.message || String(err)}`);
        const errorMsg = err.message || String(err);
        if (errorMsg.includes('Connection is not active')) {
            vscode.window.showErrorMessage(
                "SQL Rely: Database connection is not active. Please connect.",
                'Connect'
            ).then(selection => {
                if (selection === 'Connect') {
                    vscode.commands.executeCommand('mssql.connect');
                }
            });
        } else {
            vscode.window.showErrorMessage("SQL Rely: Test discovery failed. Error: " + errorMsg);
        }
    }
}

async function runHandler(request: vscode.TestRunRequest, token: vscode.CancellationToken, ctrl: vscode.TestController, api: any) {
    const run = ctrl.createTestRun(request);
    
    if (!api || !api.connectionSharing) {
        vscode.window.showErrorMessage('SQL Rely Error: Cannot run tests, connectionSharing API is missing.');
        run.end();
        return;
    }

    let editorUri = vscode.window.activeTextEditor?.document.uri.toString();
    if (!editorUri || !editorUri.endsWith('.sql')) {
        const sqlDoc = vscode.workspace.textDocuments.find(d => d.languageId === 'sql');
        if (sqlDoc) {
            editorUri = sqlDoc.uri.toString();
        }
    }

    if (!editorUri) {
        vscode.window.showErrorMessage(
            'No active SQL document found to run tests against.',
            'Got It'
        );
        run.end();
        return;
    }

    const queue: vscode.TestItem[] = [];
    if (request.include) {
        request.include.forEach(test => queue.push(test));
    } else {
        ctrl.items.forEach(test => queue.push(test));
    }

    while (queue.length > 0 && !token.isCancellationRequested) {
        const test = queue.pop()!;
        
        // If it's a test class, add its children to the queue
        if (test.children.size > 0) {
            test.children.forEach(child => queue.push(child));
            continue;
        }

        // It's a single test
        run.started(test);
        
        try {
            // Test ID is format "SchemaName.ObjectName"
            const parts = test.id.split('.');
            if (parts.length !== 2) {
                run.failed(test, new vscode.TestMessage(`Invalid test ID format: ${test.id}`));
                continue;
            }

            const schemaName = parts[0];
            const objectName = parts[1];
            
            outputChannel.appendLine(`Executing test: [${schemaName}].[${objectName}]`);

            const startStr = Date.now();
            
            // Execute the stored procedure via the tSQLt.Run framework hook
            // This is required so tSQLt sets up #TestMessage and transaction isolation
            const query = `EXEC tSQLt.Run '[${schemaName}].[${objectName}]'`; 
            
            await api.connectionSharing.executeSimpleQuery(editorUri, query);
            
            const duration = Date.now() - startStr;
            outputChannel.appendLine(`${test.id} passed in ${duration}ms`);
            run.passed(test, duration);

        } catch (err: any) {
            outputChannel.appendLine(`Test ${test.id} threw an error: ${err.message}`);
            
            // tSQLt failures are typically raised as errors
            const errorMessage = err.message || 'Test failed due to exception';
            
            // Extract the actual failure reason if it's formatted by tSQLt or SQLCop
            let cleanMessage = errorMessage;
            
            // Remove the generic ODBC/SQLClient fluff if present to make the UI cleaner
            const msgMatch = errorMessage.match(/\[SQL Server\](.*)/);
            if (msgMatch && msgMatch[1]) {
                cleanMessage = msgMatch[1].trim();
            }

            run.failed(test, new vscode.TestMessage(cleanMessage));
        }
    }

    run.end();
}
