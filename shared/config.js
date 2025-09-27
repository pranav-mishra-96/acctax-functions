module.exports = {
    // Database configuration
    SQL_SERVER: process.env.SQL_SERVER || 'acctax-sql-server.database.windows.net',
    SQL_USERNAME: process.env.SQL_USERNAME,
    SQL_PASSWORD: process.env.SQL_PASSWORD,
    SQL_DATABASE: process.env.SQL_DATABASE || 'acctax-processing-db',
    
    // Azure Storage (if needed later)
    STORAGE_ACCOUNT_NAME: process.env.STORAGE_ACCOUNT_NAME,
    STORAGE_ACCOUNT_KEY: process.env.STORAGE_ACCOUNT_KEY,
    
    // Azure Document Intelligence (for future use)
    DOCUMENT_INTELLIGENCE_ENDPOINT: process.env.DOCUMENT_INTELLIGENCE_ENDPOINT,
    DOCUMENT_INTELLIGENCE_KEY: process.env.DOCUMENT_INTELLIGENCE_KEY,
    
    // Environment
    NODE_ENV: process.env.NODE_ENV || 'production'
};
