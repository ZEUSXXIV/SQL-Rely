import * as vscode from 'vscode';
import { IExtension } from './mssql';

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
    
    outputChannel.appendLine('Activation complete.');
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

        // --- PROTOTYPE MOCK DISCOVERY ---
        const query = `
            SELECT 'tSQLt' AS SchemaName, 'test_CustomersExist' AS ObjectName
            UNION ALL
            SELECT 'tSQLt', 'test_OrdersValid'
            UNION ALL
            SELECT 'FinancialTests', 'test_RevenueCalculation'
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
            // --- PROTOTYPE MOCK EXECUTION ---
            // Simulates test execution duration
            const startStr = Date.now();
            
            // Randomly pass or fail for demonstration
            const isFailure = Math.random() > 0.7;
            const query = `
                WAITFOR DELAY '00:00:01';
                SELECT ${isFailure ? "'Failure'" : "'Success'"} as Outcome;
            `; 
            
            await api.connectionSharing.executeSimpleQuery(editorUri, query);
            
            const duration = Date.now() - startStr;
            
            if (isFailure) {
                run.failed(test, new vscode.TestMessage('Expected 1 but got 0.'), duration);
            } else {
                run.passed(test, duration);
            }

        } catch (err: any) {
            run.failed(test, new vscode.TestMessage(err.message || 'Test failed due to exception'));
        }
    }

    run.end();
}
