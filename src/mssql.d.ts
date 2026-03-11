export interface IExtension {
    connectionSharing: IConnectionSharingService;
}

export interface IConnectionSharingService {
    getActiveEditorConnectionId(extensionId: string): Promise<string | undefined>;
    getActiveDatabase(extensionId: string): string | undefined;
    executeSimpleQuery(connectionUri: string, queryString: string): Promise<SimpleExecuteResult>;
}

export interface SimpleExecuteResult {
    rowCount: number;
    columnInfo: any[];
    rows: any[][];
}
