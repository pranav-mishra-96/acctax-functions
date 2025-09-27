const sql = require('mssql');

class DatabaseManager {
    constructor() {
        this.config = {
            user: process.env.SQL_USERNAME || 'acctax_dbadmin',
            password: process.env.SQL_PASSWORD,
            server: process.env.SQL_SERVER || 'acctax-sql-server.database.windows.net',
            database: process.env.SQL_DATABASE || 'acctax-processing-db',
            options: {
                encrypt: true,
                trustServerCertificate: false,
                enableArithAbort: true
            },
            connectionTimeout: 30000,
            requestTimeout: 30000
        };
        this.pool = null;
    }

    async connect() {
        if (!this.pool) {
            this.pool = await sql.connect(this.config);
            console.log('Database connected successfully');
        }
        return this.pool;
    }

    async getOrCreateClient(email, name) {
        await this.connect();

        // Check if client exists
        const result = await this.pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT ClientID FROM Clients WHERE Email = @email');

        if (result.recordset.length > 0) {
            const clientId = result.recordset[0].ClientID;
            
            // Update last processed date
            await this.pool.request()
                .input('clientId', sql.Int, clientId)
                .query('UPDATE Clients SET LastProcessedDate = GETDATE() WHERE ClientID = @clientId');
            
            return clientId;
        }

        // Create new client
        await this.pool.request()
            .input('email', sql.NVarChar, email)
            .input('name', sql.NVarChar, name)
            .query('INSERT INTO Clients (Email, Name, CreatedDate, IsActive) VALUES (@email, @name, GETDATE(), 1)');

        // Get the new client ID
        const newClient = await this.pool.request()
            .query('SELECT @@IDENTITY AS ClientID');
        
        return newClient.recordset[0].ClientID;
    }

    async createDocument(clientId, fileName, blobPath, documentType) {
        await this.connect();
        
        await this.pool.request()
            .input('clientId', sql.Int, clientId)
            .input('fileName', sql.NVarChar, fileName)
            .input('blobPath', sql.NVarChar, blobPath)
            .input('documentType', sql.NVarChar, documentType || 'Unknown')
            .query(`INSERT INTO Documents (ClientID, OriginalFileName, BlobStoragePath, DocumentType, ProcessingStatus, UploadTimestamp)
                    VALUES (@clientId, @fileName, @blobPath, @documentType, 'pending', GETDATE())`);

        const result = await this.pool.request()
            .query('SELECT @@IDENTITY AS DocumentID');
        
        return result.recordset[0].DocumentID;
    }

    async logProcessingStep(documentId, step, status, details) {
        await this.connect();
        
        await this.pool.request()
            .input('documentId', sql.Int, documentId)
            .input('step', sql.NVarChar, step)
            .input('status', sql.NVarChar, status)
            .input('details', sql.NVarChar, details || '')
            .query(`INSERT INTO ProcessingAudit (DocumentID, ProcessingStep, Status, Details, Timestamp)
                    VALUES (@documentId, @step, @status, @details, GETDATE())`);
    }

    async close() {
        if (this.pool) {
            await this.pool.close();
            this.pool = null;
            console.log('Database connection closed');
        }
    }
}

module.exports = { DatabaseManager };