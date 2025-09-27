module.exports = {
    SQL_CONNECTION_STRING: process.env.SQL_CONNECTION_STRING || 
        'Driver={ODBC Driver 18 for SQL Server};' +
        'Server=tcp:acctax-sql-server.database.windows.net,1433;' +
        'Database=acctax-processing-db;' +
        'Uid=acctax_dbadmin;' +
        'Pwd=!One2three;' +
        'Encrypt=yes;' +
        'TrustServerCertificate=no;' +
        'Connection Timeout=30;'
};