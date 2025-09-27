const sql = require("mssql");
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require("@azure/storage-blob");
const { AzureKeyCredential, DocumentAnalysisClient } = require("@azure/ai-form-recognizer");

module.exports = async function (context, myBlob) {
  try {
    context.log("ProcessTaxDocument triggered for blob:", context.bindingData.name);
    
    const blobPath = context.bindingData.blobTrigger;
    const fileName = context.bindingData.name;
    
    context.log(`Processing file: ${fileName}`);
    context.log(`Full path: ${blobPath}`);
    
    // Database config
    const config = {
      server: process.env.SQL_SERVER,
      database: process.env.SQL_DATABASE,
      user: process.env.SQL_USERNAME,
      password: process.env.SQL_PASSWORD,
      options: {
        encrypt: true,
        trustServerCertificate: false,
        enableArithAbort: true
      },
      connectionTimeout: 30000,
      requestTimeout: 30000
    };
    
    // Connect to database
    await sql.connect(config);
    
    // Find the document in database by blob path
    const docResult = await sql.query`
      SELECT DocumentID, ClientID, DocumentType 
      FROM Documents 
      WHERE BlobStoragePath = ${blobPath}
      AND ProcessingStatus = 'pending'
    `;
    
    if (docResult.recordset.length === 0) {
      context.log.warn(`No pending document found for path: ${blobPath}`);
      return;
    }
    
    const document = docResult.recordset[0];
    context.log(`Found document ID: ${document.DocumentID}`);
    
    // Update status to processing
    await sql.query`
      UPDATE Documents 
      SET ProcessingStatus = 'processing', 
          ProcessedTimestamp = GETDATE()
      WHERE DocumentID = ${document.DocumentID}
    `;
    
    // Log processing start
    await sql.query`
      INSERT INTO ProcessingAudit (DocumentID, ProcessingStep, Status, Details, Timestamp)
      VALUES (${document.DocumentID}, 'Blob trigger activated', 'success', 
              ${`File: ${fileName}, Type: ${document.DocumentType}`}, GETDATE())
    `;
    
    context.log(`Document ${document.DocumentID} status updated to processing`);
    
    // Check if we should process with AI based on document type
    if (document.DocumentType === 'T4A') {
      context.log('Processing T4A document with Document Intelligence');
      
      // Initialize Document Intelligence client
      const endpoint = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
      const apiKey = process.env.DOCUMENT_INTELLIGENCE_KEY;
      const modelId = process.env.T4A_MODEL_ID || 't4a-model-v1';
      
      const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey));
      
      // Get storage account credentials
      const storageAccountName = process.env.STORAGE_ACCOUNT_NAME;
      const storageAccountKey = process.env.STORAGE_ACCOUNT_KEY;
      
      const containerName = 'email-attachments';
      const blobName = context.bindingData.name;
      
      // Generate proper SAS token
      const sharedKeyCredential = new StorageSharedKeyCredential(storageAccountName, storageAccountKey);
      
      const sasToken = generateBlobSASQueryParameters({
        containerName: containerName,
        blobName: blobName,
        permissions: BlobSASPermissions.parse("r"),
        startsOn: new Date(new Date().valueOf() - 5 * 60 * 1000), // 5 minutes ago
        expiresOn: new Date(new Date().valueOf() + 3600 * 1000), // 1 hour from now
      }, sharedKeyCredential).toString();
      
      const sasUrl = `https://${storageAccountName}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`;
      
      context.log(`Generated SAS URL for Document Intelligence`);
      context.log(`Analyzing document with model: ${modelId}`);
      
      // Analyze document with custom model
      const poller = await client.beginAnalyzeDocumentFromUrl(modelId, sasUrl);
      const result = await poller.pollUntilDone();
      
      context.log('Document analysis complete');
      
      // Extract fields
      if (result.documents && result.documents.length > 0) {
        const extractedDoc = result.documents[0];
        const fields = extractedDoc.fields;
        
        context.log(`Extracted ${Object.keys(fields).length} fields`);
        
        // Store extracted data in database
        for (const [fieldName, field] of Object.entries(fields)) {
          if (field.value !== undefined && field.value !== null) {
            const confidence = field.confidence || 0;
            
            await sql.query`
              INSERT INTO ExtractedData (DocumentID, FieldName, FieldValue, Confidence, ExtractedTimestamp)
              VALUES (${document.DocumentID}, ${fieldName}, ${String(field.value)}, ${confidence}, GETDATE())
            `;
            
            context.log(`Stored field: ${fieldName} = ${field.value} (confidence: ${confidence})`);
          }
        }
        
        // Calculate average confidence
        const confidences = Object.values(fields)
          .filter(f => f.confidence !== undefined)
          .map(f => f.confidence);
        const avgConfidence = confidences.length > 0 
          ? confidences.reduce((a, b) => a + b, 0) / confidences.length 
          : 0;
        
        // Update document with confidence and status
        await sql.query`
          UPDATE Documents 
          SET ProcessingStatus = 'completed',
              Confidence = ${avgConfidence},
              ProcessedTimestamp = GETDATE()
          WHERE DocumentID = ${document.DocumentID}
        `;
        
        await sql.query`
          INSERT INTO ProcessingAudit (DocumentID, ProcessingStep, Status, Details, Timestamp)
          VALUES (${document.DocumentID}, 'AI extraction completed', 'success', 
                  ${`Fields extracted: ${Object.keys(fields).length}, Avg confidence: ${(avgConfidence * 100).toFixed(2)}%`}, 
                  GETDATE())
        `;
        
        context.log(`Document ${document.DocumentID} completed with confidence ${(avgConfidence * 100).toFixed(2)}%`);
        
      } else {
        throw new Error('No documents found in analysis result');
      }
      
    } else {
      // For non-T4A documents, just mark as ready_for_ai for now
      context.log(`Document type ${document.DocumentType} - no AI model available yet`);
      
      await sql.query`
        UPDATE Documents 
        SET ProcessingStatus = 'ready_for_ai'
        WHERE DocumentID = ${document.DocumentID}
      `;
      
      await sql.query`
        INSERT INTO ProcessingAudit (DocumentID, ProcessingStep, Status, Details, Timestamp)
        VALUES (${document.DocumentID}, 'Ready for AI processing', 'success', 
                'File validated and ready for Document Intelligence', GETDATE())
      `;
    }
    
    context.log(`Processing complete for document ${document.DocumentID}`);
    
  } catch (error) {
    context.log.error("Function error:", error);
    context.log.error("Error stack:", error.stack);
    
    // Try to log error to database
    try {
      if (context.bindingData) {
        const blobPath = context.bindingData.blobTrigger;
        await sql.query`
          UPDATE Documents 
          SET ProcessingStatus = 'error',
              ErrorMessage = ${error.message}
          WHERE BlobStoragePath = ${blobPath}
        `;
        
        const docResult = await sql.query`
          SELECT DocumentID FROM Documents WHERE BlobStoragePath = ${blobPath}
        `;
        
        if (docResult.recordset.length > 0) {
          const docId = docResult.recordset[0].DocumentID;
          await sql.query`
            INSERT INTO ProcessingAudit (DocumentID, ProcessingStep, Status, Details, ErrorDetails, Timestamp)
            VALUES (${docId}, 'Processing error', 'error', ${error.message}, ${error.stack}, GETDATE())
          `;
        }
      }
    } catch (dbError) {
      context.log.error("Failed to log error to database:", dbError);
    }
    
    throw error;
  } finally {
    try {
      await sql.close();
    } catch (err) {
      context.log.error("Error closing SQL connection:", err);
    }
  }
};