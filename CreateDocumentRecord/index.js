const { app } = require('@azure/functions');
const { DatabaseManager } = require('../shared/database');
const { detectDocumentType } = require('../shared/utils');

app.http('CreateDocumentRecord', {
    methods: ['POST'],
    authLevel: 'function',
    route: 'CreateDocumentRecord',
    handler: async (request, context) => {
        context.log('CreateDocumentRecord function triggered');
        
        let db = null;

        try {
            const body = await request.json();
            context.log('Request body:', JSON.stringify(body));
            
            const { clientEmail, clientName, folderPath, attachments } = body;

            // Validation
            if (!clientEmail) {
                context.log('Missing clientEmail');
                return {
                    status: 400,
                    jsonBody: { error: 'clientEmail is required' }
                };
            }

            if (!folderPath) {
                context.log('Missing folderPath');
                return {
                    status: 400,
                    jsonBody: { error: 'folderPath is required' }
                };
            }

            if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
                context.log('Invalid or missing attachments');
                return {
                    status: 400,
                    jsonBody: { error: 'At least one attachment is required' }
                };
            }

            // Initialize database
            db = new DatabaseManager();
            await db.connect();
            context.log('Database connection established');

            // Get or create client
            context.log(`Getting or creating client: ${clientEmail}`);
            const clientId = await db.getOrCreateClient(
                clientEmail, 
                clientName || clientEmail.split('@')[0]
            );
            context.log(`Client ID: ${clientId}`);

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

                context.log(`Creating document record for: ${fileName} (Type: ${documentType || 'Unknown'})`);
                
                const documentId = await db.createDocument(
                    clientId,
                    fileName,
                    blobPath,
                    documentType
                );

                // Log audit trail
                await db.logProcessingStep(
                    documentId,
                    'Document received via email',
                    'success',
                    `File: ${fileName}, Size: ${size || 'unknown'} bytes, Type: ${contentType || 'unknown'}`
                );

                createdDocuments.push({
                    documentId,
                    fileName,
                    documentType: documentType || 'Unknown',
                    blobPath
                });

                context.log(`Created document ID: ${documentId}`);
            }

            return {
                status: 200,
                jsonBody: {
                    success: true,
                    clientId,
                    clientEmail,
                    documentsCreated: createdDocuments.length,
                    documents: createdDocuments,
                    timestamp: new Date().toISOString()
                }
            };

        } catch (error) {
            context.log.error('Error creating document records:', error);
            context.log.error('Error stack:', error.stack);
            
            return {
                status: 500,
                jsonBody: {
                    error: 'Internal server error',
                    details: error.message,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                }
            };
        } finally {
            // Always close the database connection
            if (db) {
                try {
                    await db.close();
                    context.log('Database connection closed');
                } catch (closeError) {
                    context.log.error('Error closing database:', closeError);
                }
            }
        }
    }
});