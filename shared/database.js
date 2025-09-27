const { Connection, Request, TYPES } = require('tedious');

class DatabaseManager {
    constructor() {
        this.config = {
            server: 'acctax-sql-server.database.windows.net',
            authentication: {
                type: 'default',
                options: {
                    userName: 'acctax_dbadmin',
                    password: '!One2three'
                }
            },
            options: {
                database: 'acctax-processing-db',
                encrypt: true,
                port: 1433,
                trustServerCertificate: false
            }
        };
        this.connection = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.connection = new Connection(this.config);
            
            this.connection.on('connect', err => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
            
            this.connection.connect();
        });
    }

    executeQuery(query, params = []) {
        return new Promise((resolve, reject) => {
            const results = [];
            const request = new Request(query, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(results);
                }
            });

            params.forEach(param => {
                request.addParameter(param.name, param.type, param.value);
            });

            request.on('row', columns => {
                const row = {};
                columns.forEach(column => {
                    row[column.metadata.colName] = column.value;
                });
                results.push(row);
            });

            this.connection.execSql(request);
        });
    }

    async getOrCreateClient(email, name) {
        if (!this.connection) await this.connect();

        const existing = await this.executeQuery(
            'SELECT ClientID FROM Clients WHERE Email = @email',
            [{ name: 'email', type: TYPES.NVarChar, value: email }]
        );

        if (existing.length > 0) {
            await this.executeQuery(
                'UPDATE Clients SET LastProcessedDate = GETDATE() WHERE ClientID = @clientId',
                [{ name: 'clientId', type: TYPES.Int, value: existing[0].ClientID }]
            );
            return existing[0].ClientID;
        }

        await this.executeQuery(
            'INSERT INTO Clients (Email, Name) VALUES (@email, @name)',
            [
                { name: 'email', type: TYPES.NVarChar, value: email },
                { name: 'name', type: TYPES.NVarChar, value: name }
            ]
        );

        const newClient = await this.executeQuery('SELECT @@IDENTITY AS ClientID');
        return newClient[0].ClientID;
    }

    async createDocument(clientId, fileName, blobPath, documentType) {
        if (!this.connection) await this.connect();
        
        await this.executeQuery(
            `INSERT INTO Documents (ClientID, OriginalFileName, BlobStoragePath, DocumentType, ProcessingStatus)
             VALUES (@clientId, @fileName, @blobPath, @documentType, 'pending')`,
            [
                { name: 'clientId', type: TYPES.Int, value: clientId },
                { name: 'fileName', type: TYPES.NVarChar, value: fileName },
                { name: 'blobPath', type: TYPES.NVarChar, value: blobPath },
                { name: 'documentType', type: TYPES.NVarChar, value: documentType }
            ]
        );

        const result = await this.executeQuery('SELECT @@IDENTITY AS DocumentID');
        return result[0].DocumentID;
    }

    async logProcessingStep(documentId, step, status, details) {
        if (!this.connection) await this.connect();
        
        await this.executeQuery(
            `INSERT INTO ProcessingAudit (DocumentID, ProcessingStep, Status, Details)
             VALUES (@documentId, @step, @status, @details)`,
            [
                { name: 'documentId', type: TYPES.Int, value: documentId },
                { name: 'step', type: TYPES.NVarChar, value: step },
                { name: 'status', type: TYPES.NVarChar, value: status },
                { name: 'details', type: TYPES.NVarChar, value: details }
            ]
        );
    }

    close() {
        if (this.connection) {
            this.connection.close();
        }
    }
}

module.exports = { DatabaseManager };