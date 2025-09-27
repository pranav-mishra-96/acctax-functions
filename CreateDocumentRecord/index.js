module.exports = async function (context, req) {
    context.log('=== Function started ===');
    
    try {
        context.log('Loading dependencies...');
        const sql = require('mssql');
        context.log('mssql loaded successfully');
        
        const { detectDocumentType } = require('../shared/utils');
        context.log('utils loaded successfully');
        
        context.log('Request body:', JSON.stringify(req.body));
        
        const { clientEmail, clientName, folderPath, attachments } = req.body;

        // Validation
        if (!clientEmail) {
            context.log('Missing clientEmail');
            context.res = {
                status: 400,
                body: { error: 'clientEmail is required' }
            };
            return;
        }

        if (!folderPath) {
            context.log('Missing folderPath');
            context.res = {
                status: 400,
                body: { error: 'folderPath is required' }
            };
            return;
        }

        if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
            context.log('Invalid or missing attachments');
            context.res = {
                status: 400,
                body: { error: 'At least one attachment is required' }
            };
            return;
        }

        // Database config
        context.log('Creating database config...');
        const config = {
            user: process.env.SQL_USERNAME,
            password: process.env.SQL_PASSWORD,
            server: process.env.SQL_SERVER,
            database: process.env.SQL_DATABASE,
            options: {
                encrypt: true,
                trustServerCertificate: false,
                enableArithAbort: true
            },
            connectionTimeout: 30000,
            requestTimeout: 30000
        };
        
        context.log('Config created:', {
            server: config.server,
            database: config.database,
            user: config.user,
            hasPassword: !!config.password
        });

        // Connect to database
        context.log('Connecting to database...');
        const pool = await sql.connect(config);
        context.log('Database connected successfully');

        // Get or create client
        context.log(`Getting or creating client: ${clientEmail}`);
        
        const existingClient = await pool.request()
            .input('email', sql.NVarChar, clientEmail)
            .query('SELECT ClientID FROM Clients WHERE Email = @email');

        let clientId;
        if (existingClient.recordset.length > 0) {
            clientId = existingClient.recordset[0].ClientID;
            context.log(`Found existing client: ${clientId}`);
            
            await pool.request()
                .input('clientId', sql.Int, clientId)
                .query('UPDATE Clients SET LastProcessedDate = GETDATE() WHERE ClientID = @clientId');
        } else {
            context.log('Creating new client...');
            await pool.request()
                .input('email', sql.NVarChar, clientEmail)
                .input('name', sql.NVarChar, clientName || clientEmail.split('@')[0])
                .query('INSERT INTO Clients (Email, Name, CreatedDate, IsActive) VALUES (@email, @name, GETDATE(), 1)');

            const newClient = await pool.request().query('SELECT @@IDENTITY AS ClientID');
            clientId = newClient.recordset[0].ClientID;
            context.log(`Created new client: ${clientId}`);
        }

        // Create document records
        const createdDocuments = [];

        for (const attachment of attachments) {
            const { fileName, contentType, size } = attachment;

            if (!fileName) {
                context.log.warn('Skipping attachment without fileName');
                continue;
            }

            const documentType = detectDocumentType(fileName);
            const blobPath = `email-attachments/${folderPath}/${fileName}`;

            context.log(`Creating document: ${fileName}`);
            
            await pool.request()
                .input('clientId', sql.Int, clientId)
                .input('fileName', sql.NVarChar, fileName)
                .input('blobPath', sql.NVarChar, blobPath)
                .input('documentType', sql.NVarChar, documentType || 'Unknown')
                .query(`INSERT INTO Documents (ClientID, OriginalFileName, BlobStoragePath, DocumentType, ProcessingStatus, UploadTimestamp)
                        VALUES (@clientId, @fileName, @blobPath, @documentType, 'pending', GETDATE())`);

            const docResult = await pool.request().query('SELECT @@IDENTITY AS DocumentID');
            const documentId = docResult.recordset[0].DocumentID;

            // Log audit
            await pool.request()
                .input('documentId', sql.Int, documentId)
                .input('step', sql.NVarChar, 'Document received via email')
                .input('status', sql.NVarChar, 'success')
                .input('details', sql.NVarChar, `File: ${fileName}, Size: ${size || 'unknown'} bytes`)
                .query(`INSERT INTO ProcessingAudit (DocumentID, ProcessingStep, Status, Details, Timestamp)
                        VALUES (@documentId, @step, @status, @details, GETDATE())`);

            createdDocuments.push({
                documentId,
                fileName,
                documentType: documentType || 'Unknown',
                blobPath
            });

            context.log(`Created document ID: ${documentId}`);
        }

        await pool.close();
        context.log('Database connection closed');

        context.res = {
            status: 200,
            body: {
                success: true,
                clientId,
                clientEmail,
                documentsCreated: createdDocuments.length,
                documents: createdDocuments,
                timestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        context.log.error('=== ERROR OCCURRED ===');
        context.log.error('Error message:', error.message);
        context.log.error('Error stack:', error.stack);
        context.log.error('Error details:', JSON.stringify(error, null, 2));
        
        context.res = {
            status: 500,
            body: {
                error: 'Internal server error',
                details: error.message,
                stack: error.stack
            }
        };
    }
};