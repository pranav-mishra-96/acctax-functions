import os

class Config:
    """Configuration settings for the application"""
    
    # Database connection string from Function App environment variables
    SQL_CONNECTION_STRING = os.environ.get(
        'SQL_CONNECTION_STRING',
        'Driver={ODBC Driver 18 for SQL Server};'
        'Server=tcp:acctax-sql-server.database.windows.net,1433;'
        'Database=acctax-processing-db;'
        'Uid=acctax_dbadmin;'
        'Pwd=!One2three;'  
        'Encrypt=yes;'
        'TrustServerCertificate=no;'
        'Connection Timeout=30;'
    )
    
    # Blob storage settings
    STORAGE_ACCOUNT_NAME = os.environ.get('STORAGE_ACCOUNT_NAME', 'acctaxstorage')
    STORAGE_CONNECTION_STRING = os.environ.get('STORAGE_CONNECTION_STRING', '')
    
    # Container names
    EMAIL_ATTACHMENTS_CONTAINER = 'email-attachments'
    PROCESSED_DOCUMENTS_CONTAINER = 'processed-documents'
    TRAINING_DATA_CONTAINER = 'training-data'
    
    # Document Intelligence settings
    DOCUMENT_INTELLIGENCE_ENDPOINT = os.environ.get('DOCUMENT_INTELLIGENCE_ENDPOINT', '')
    DOCUMENT_INTELLIGENCE_KEY = os.environ.get('DOCUMENT_INTELLIGENCE_KEY', '')
    
    # Processing settings
    MIN_CONFIDENCE_THRESHOLD = 85.0  # Minimum AI confidence score
    SUPPORTED_DOCUMENT_TYPES = ['T4', 'T4A', 'T5', 'T4E', 'T5008']
    SUPPORTED_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png']
    MAX_FILE_SIZE_MB = 10