const sql = require("mssql");
const { BlobServiceClient } = require("@azure/storage-blob");

module.exports = async function (context, myBlob) {
  try {
    context.log("ProcessTaxDocument triggered for blob:", context.bindingData.name);
    
    const blobPath = context.bindingData.blobTrigger;
    const fileName = context.bindingData.name;
    
    context.log(`Processing file: ${fileName}`);
    context.log(`Full path: ${blobPath}`);
    
    // Connect to database
    //await sql.connect(process.env.SQL_CONNECTION_STRING);
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
    
    // TODO: In next phase, call Document Intelligence here
    // For now, just mark as ready for AI processing
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
    
    context.log(`Document ${document.DocumentID} ready for AI processing`);
    
  } catch (error) {
    context.log.error("Function error:", error);
    context.log.error("Error stack:", error.stack);
    
    // Try to log error to database if we have a document ID
    try {
      if (context.bindingData) {
        const blobPath = context.bindingData.blobTrigger;
        await sql.query`
          UPDATE Documents 
          SET ProcessingStatus = 'error',
              ErrorMessage = ${error.message}
          WHERE BlobStoragePath = ${blobPath}
        `;
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