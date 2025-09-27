const { app } = require('@azure/functions');
const { DatabaseManager } = require('../shared/database');
const { detectDocumentType } = require('../shared/utils');

app.http('CreateDocumentRecord', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('CreateDocumentRecord function triggered');

        try {
            const body = await request.json();
            const { clientEmail, clientName, folderPath, attachments } = body;

            // Validation
            if (!clientEmail) {
                return {
                    status: 400,
                    jsonBody: { error: 'clientEmail is required' }
                };
            }

            if (!folderPath) {
                return {
                    status: 400,
                    jsonBody: { error: 'folderPath is required' }
                };
            }

            if (!attachments || attachments.length === 0) {
                return {
                    status: 400,
                    jsonBody: { error: 'At least one attachment is required' }
                };
            }

            const db = new DatabaseManager();

            // Get or create client
            context.log(`Getting or creating client: ${clientEmail}`);
            const clientId = await db.getOrCreateClient(clientEmail, clientName || clientEmail.split('@')[0]);
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

                context.log(`Creating document record for: ${fileName}`);
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
                    `File: ${fileName}, Size: ${size} bytes, Type: ${contentType}`
                );

                createdDocuments.push({
                    documentId,
                    fileName,
                    documentType,
                    blobPath
                });

                context.log(`Created document ID: ${documentId}`);
            }

            await db.close();

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
            return {
                status: 500,
                jsonBody: {
                    error: 'Internal server error',
                    details: error.message
                }
            };
        }
    }
});