const sql = require("mssql");
const { detectDocumentType } = require("../shared/utils");

module.exports = async function (context, req) {
  try {
    context.log("CreateDocumentRecord function triggered");

    const { clientEmail, clientName, folderPath, attachments } = req.body;

    // Validation
    if (!clientEmail) {
      context.log.warn("Missing clientEmail");
      context.res = {
        status: 400,
        body: {
          error: "clientEmail is required"
        }
      };
      return;
    }

    if (!folderPath) {
      context.log.warn("Missing folderPath");
      context.res = {
        status: 400,
        body: {
          error: "folderPath is required"
        }
      };
      return;
    }

    if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
      context.log.warn("Invalid or missing attachments");
      context.res = {
        status: 400,
        body: {
          error: "At least one attachment is required"
        }
      };
      return;
    }

    // Connect to database
    context.log("Connecting to database...");
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
    context.log("Database connected");

    // Get or create client
    context.log(`Getting or creating client: ${clientEmail}`);
    
    const existingClientResult = await sql.query`
      SELECT ClientID FROM Clients WHERE Email = ${clientEmail}
    `;

    let clientId;
    
    if (existingClientResult.recordset.length > 0) {
      clientId = existingClientResult.recordset[0].ClientID;
      context.log(`Found existing client: ${clientId}`);
      
      // Update last processed date
      await sql.query`
        UPDATE Clients 
        SET LastProcessedDate = GETDATE() 
        WHERE ClientID = ${clientId}
      `;
    } else {
      context.log("Creating new client...");
      const clientNameValue = clientName || clientEmail.split('@')[0];
      
      await sql.query`
        INSERT INTO Clients (Email, Name, CreatedDate, IsActive)
        VALUES (${clientEmail}, ${clientNameValue}, GETDATE(), 1)
      `;

      const newClientResult = await sql.query`SELECT @@IDENTITY AS ClientID`;
      clientId = newClientResult.recordset[0].ClientID;
      context.log(`Created new client: ${clientId}`);
    }

    // Create document records
    const createdDocuments = [];

    for (const attachment of attachments) {
      const { fileName, contentType, size } = attachment;

      if (!fileName) {
        context.log.warn("Skipping attachment without fileName");
        continue;
      }

      const documentType = detectDocumentType(fileName);
      const blobPath = `email-attachments/${folderPath}/${fileName}`;

      context.log(`Creating document: ${fileName} (Type: ${documentType || 'Unknown'})`);
      
      await sql.query`
        INSERT INTO Documents (ClientID, OriginalFileName, BlobStoragePath, DocumentType, ProcessingStatus, UploadTimestamp)
        VALUES (${clientId}, ${fileName}, ${blobPath}, ${documentType || 'Unknown'}, 'pending', GETDATE())
      `;

      const docResult = await sql.query`SELECT @@IDENTITY AS DocumentID`;
      const documentId = docResult.recordset[0].DocumentID;

      // Log audit
      const auditDetails = `File: ${fileName}, Size: ${size || 'unknown'} bytes, Type: ${contentType || 'unknown'}`;
      
      await sql.query`
        INSERT INTO ProcessingAudit (DocumentID, ProcessingStep, Status, Details, Timestamp)
        VALUES (${documentId}, 'Document received via email', 'success', ${auditDetails}, GETDATE())
      `;

      createdDocuments.push({
        documentId,
        fileName,
        documentType: documentType || 'Unknown',
        blobPath
      });

      context.log(`Created document ID: ${documentId}`);
    }

    context.log(`Successfully created ${createdDocuments.length} documents`);

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
    context.log.error("Function error:", error);
    context.log.error("Error stack:", error.stack);
    
    context.res = {
      status: 500,
      body: {
        error: "Failed to create document records. Please try again.",
        details: error.message
      }
    };
  } finally {
    try {
      await sql.close();
      context.log("Database connection closed");
    } catch (err) {
      context.log.error("Error closing SQL connection:", err);
    }
  }
};