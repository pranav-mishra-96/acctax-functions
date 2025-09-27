const sql = require("mssql");

module.exports = async function (context, req) {
  try {
    const action = context.bindingData.action || 'stats';
    
    const config = {
      server: process.env.SQL_SERVER,
      database: process.env.SQL_DATABASE,
      user: process.env.SQL_USERNAME,
      password: process.env.SQL_PASSWORD,
      options: {
        encrypt: true,
        trustServerCertificate: false,
        enableArithAbort: true
      }
    };
    
    await sql.connect(config);
    
    switch(action) {
      case 'stats':
        const statsResult = await sql.query`
          SELECT 
            COUNT(*) as TotalDocuments,
            SUM(CASE WHEN ProcessingStatus = 'completed' THEN 1 ELSE 0 END) as CompletedDocuments,
            SUM(CASE WHEN ProcessingStatus = 'error' THEN 1 ELSE 0 END) as ErrorDocuments,
            SUM(CASE WHEN ProcessingStatus = 'processing' THEN 1 ELSE 0 END) as ProcessingDocuments,
            SUM(CASE WHEN ProcessingStatus = 'pending' THEN 1 ELSE 0 END) as PendingDocuments,
            AVG(CASE WHEN Confidence IS NOT NULL THEN Confidence ELSE NULL END) as AvgConfidence,
            COUNT(DISTINCT ClientID) as TotalClients
          FROM Documents
        `;
        context.res = {
          status: 200,
          body: statsResult.recordset[0]
        };
        break;
        
      case 'clients':
        const clientsResult = await sql.query`
          SELECT ClientID, Email, Name, CreatedDate, LastProcessedDate, IsActive
          FROM Clients
          ORDER BY LastProcessedDate DESC
        `;
        context.res = {
          status: 200,
          body: clientsResult.recordset
        };
        break;
        
      case 'documents':
        const { clientId, status, documentType } = req.query;
        let query = `
          SELECT 
            d.DocumentID, d.ClientID, d.OriginalFileName, d.DocumentType,
            d.UploadTimestamp, d.ProcessingStatus, d.Confidence,
            d.ErrorMessage, d.ProcessedTimestamp, d.TaxYear,
            c.Email as ClientEmail, c.Name as ClientName
          FROM Documents d
          JOIN Clients c ON d.ClientID = c.ClientID
          WHERE 1=1
        `;
        
        const request = new sql.Request();
        
        if (clientId) {
          query += ` AND d.ClientID = @clientId`;
          request.input('clientId', sql.Int, parseInt(clientId));
        }
        if (status) {
          query += ` AND d.ProcessingStatus = @status`;
          request.input('status', sql.NVarChar, status);
        }
        if (documentType) {
          query += ` AND d.DocumentType = @documentType`;
          request.input('documentType', sql.NVarChar, documentType);
        }
        
        query += ` ORDER BY d.UploadTimestamp DESC`;
        
        const docsResult = await request.query(query);
        context.res = {
          status: 200,
          body: docsResult.recordset
        };
        break;
        
      case 'document':
        const documentId = req.query.id;
        if (!documentId) {
          context.res = { status: 400, body: { error: 'Document ID required' } };
          return;
        }
        
        const docResult = await sql.query`
          SELECT d.*, c.Email as ClientEmail, c.Name as ClientName
          FROM Documents d
          JOIN Clients c ON d.ClientID = c.ClientID
          WHERE d.DocumentID = ${documentId}
        `;
        
        const extractedResult = await sql.query`
          SELECT FieldName, FieldValue, Confidence, ExtractedTimestamp
          FROM ExtractedData
          WHERE DocumentID = ${documentId}
          ORDER BY FieldName
        `;
        
        const auditResult = await sql.query`
          SELECT ProcessingStep, Status, Timestamp, Details, ErrorDetails
          FROM ProcessingAudit
          WHERE DocumentID = ${documentId}
          ORDER BY Timestamp DESC
        `;
        
        context.res = {
          status: 200,
          body: {
            document: docResult.recordset[0] || null,
            extractedData: extractedResult.recordset,
            auditTrail: auditResult.recordset
          }
        };
        break;
        
      default:
        context.res = {
          status: 404,
          body: { error: 'Action not found' }
        };
    }
    
  } catch (error) {
    context.log.error('Dashboard API error:', error);
    context.res = {
      status: 500,
      body: { error: error.message }
    };
  } finally {
    try {
      await sql.close();
    } catch (err) {
      context.log.error('Error closing SQL connection:', err);
    }
  }
};