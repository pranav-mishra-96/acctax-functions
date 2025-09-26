import pyodbc
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from .config import Config

# Set up logging
logger = logging.getLogger(__name__)


class DatabaseManager:
    """Handles all database operations for the tax document processing system"""
    
    def __init__(self):
        self.connection_string = Config.SQL_CONNECTION_STRING
    
    def get_connection(self):
        """Create and return a database connection"""
        try:
            conn = pyodbc.connect(self.connection_string)
            return conn
        except Exception as e:
            logger.error(f"Database connection failed: {str(e)}")
            raise
    
    # ==================== CLIENT OPERATIONS ====================
    
    def get_or_create_client(self, email: str, name: str = None) -> int:
        """
        Get existing client or create new one. Returns ClientID.
        
        Args:
            email: Client email address
            name: Client name (optional)
            
        Returns:
            int: ClientID
        """
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            # Check if client exists
            cursor.execute(
                "SELECT ClientID FROM Clients WHERE Email = ?",
                (email,)
            )
            row = cursor.fetchone()
            
            if row:
                client_id = row[0]
                logger.info(f"Found existing client: {email} (ID: {client_id})")
                
                # Update last processed date
                cursor.execute(
                    "UPDATE Clients SET LastProcessedDate = GETDATE() WHERE ClientID = ?",
                    (client_id,)
                )
                conn.commit()
                return client_id
            
            # Create new client
            cursor.execute(
                "INSERT INTO Clients (Email, Name) VALUES (?, ?)",
                (email, name or email.split('@')[0])
            )
            conn.commit()
            
            # Get the new ClientID
            cursor.execute("SELECT @@IDENTITY")
            client_id = int(cursor.fetchone()[0])
            
            logger.info(f"Created new client: {email} (ID: {client_id})")
            return client_id
            
        except Exception as e:
            logger.error(f"Error in get_or_create_client: {str(e)}")
            conn.rollback()
            raise
        finally:
            cursor.close()
            conn.close()
    
    def get_client_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get client details by email"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute(
                """SELECT ClientID, Email, Name, CreatedDate, LastProcessedDate, IsActive
                   FROM Clients WHERE Email = ?""",
                (email,)
            )
            row = cursor.fetchone()
            
            if row:
                return {
                    'ClientID': row[0],
                    'Email': row[1],
                    'Name': row[2],
                    'CreatedDate': row[3],
                    'LastProcessedDate': row[4],
                    'IsActive': row[5]
                }
            return None
            
        finally:
            cursor.close()
            conn.close()
    
    # ==================== DOCUMENT OPERATIONS ====================
    
    def create_document(self, client_id: int, original_filename: str, 
                       blob_path: str, document_type: str = None) -> int:
        """
        Create a new document record.
        
        Args:
            client_id: Client ID
            original_filename: Original file name
            blob_path: Path in blob storage
            document_type: Type of tax document (T4, T4A, etc.)
            
        Returns:
            int: DocumentID
        """
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute(
                """INSERT INTO Documents 
                   (ClientID, OriginalFileName, BlobStoragePath, DocumentType, ProcessingStatus)
                   VALUES (?, ?, ?, ?, 'pending')""",
                (client_id, original_filename, blob_path, document_type)
            )
            conn.commit()
            
            cursor.execute("SELECT @@IDENTITY")
            document_id = int(cursor.fetchone()[0])
            
            logger.info(f"Created document ID: {document_id} for client {client_id}")
            return document_id
            
        except Exception as e:
            logger.error(f"Error creating document: {str(e)}")
            conn.rollback()
            raise
        finally:
            cursor.close()
            conn.close()
    
    def update_document_status(self, document_id: int, status: str, 
                              error_message: str = None, confidence: float = None):
        """
        Update document processing status.
        
        Args:
            document_id: Document ID
            status: New status (pending/processing/completed/error)
            error_message: Error message if status is 'error'
            confidence: AI confidence score
        """
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            if status == 'completed':
                cursor.execute(
                    """UPDATE Documents 
                       SET ProcessingStatus = ?, Confidence = ?, ProcessedTimestamp = GETDATE()
                       WHERE DocumentID = ?""",
                    (status, confidence, document_id)
                )
            elif status == 'error':
                cursor.execute(
                    """UPDATE Documents 
                       SET ProcessingStatus = ?, ErrorMessage = ?, ProcessedTimestamp = GETDATE()
                       WHERE DocumentID = ?""",
                    (status, error_message, document_id)
                )
            else:
                cursor.execute(
                    "UPDATE Documents SET ProcessingStatus = ? WHERE DocumentID = ?",
                    (status, document_id)
                )
            
            conn.commit()
            logger.info(f"Updated document {document_id} status to: {status}")
            
        except Exception as e:
            logger.error(f"Error updating document status: {str(e)}")
            conn.rollback()
            raise
        finally:
            cursor.close()
            conn.close()
    
    def get_document_by_id(self, document_id: int) -> Optional[Dict[str, Any]]:
        """Get document details by ID"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute(
                """SELECT DocumentID, ClientID, OriginalFileName, BlobStoragePath, 
                          DocumentType, UploadTimestamp, ProcessingStatus, 
                          Confidence, ErrorMessage, ProcessedTimestamp, TaxYear
                   FROM Documents WHERE DocumentID = ?""",
                (document_id,)
            )
            row = cursor.fetchone()
            
            if row:
                return {
                    'DocumentID': row[0],
                    'ClientID': row[1],
                    'OriginalFileName': row[2],
                    'BlobStoragePath': row[3],
                    'DocumentType': row[4],
                    'UploadTimestamp': row[5],
                    'ProcessingStatus': row[6],
                    'Confidence': row[7],
                    'ErrorMessage': row[8],
                    'ProcessedTimestamp': row[9],
                    'TaxYear': row[10]
                }
            return None
            
        finally:
            cursor.close()
            conn.close()
    
    def get_documents_by_client(self, client_id: int, status: str = None) -> List[Dict[str, Any]]:
        """Get all documents for a client, optionally filtered by status"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            if status:
                cursor.execute(
                    """SELECT DocumentID, OriginalFileName, DocumentType, 
                              UploadTimestamp, ProcessingStatus, Confidence
                       FROM Documents 
                       WHERE ClientID = ? AND ProcessingStatus = ?
                       ORDER BY UploadTimestamp DESC""",
                    (client_id, status)
                )
            else:
                cursor.execute(
                    """SELECT DocumentID, OriginalFileName, DocumentType, 
                              UploadTimestamp, ProcessingStatus, Confidence
                       FROM Documents 
                       WHERE ClientID = ?
                       ORDER BY UploadTimestamp DESC""",
                    (client_id,)
                )
            
            documents = []
            for row in cursor.fetchall():
                documents.append({
                    'DocumentID': row[0],
                    'OriginalFileName': row[1],
                    'DocumentType': row[2],
                    'UploadTimestamp': row[3],
                    'ProcessingStatus': row[4],
                    'Confidence': row[5]
                })
            
            return documents
            
        finally:
            cursor.close()
            conn.close()
    
    # ==================== EXTRACTED DATA OPERATIONS ====================
    
    def insert_extracted_data(self, document_id: int, field_name: str, 
                             field_value: str, confidence: float):
        """Insert extracted field data from AI processing"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute(
                """INSERT INTO ExtractedData 
                   (DocumentID, FieldName, FieldValue, Confidence)
                   VALUES (?, ?, ?, ?)""",
                (document_id, field_name, field_value, confidence)
            )
            conn.commit()
            logger.info(f"Inserted extracted data: {field_name} for document {document_id}")
            
        except Exception as e:
            logger.error(f"Error inserting extracted data: {str(e)}")
            conn.rollback()
            raise
        finally:
            cursor.close()
            conn.close()
    
    def insert_extracted_data_batch(self, document_id: int, 
                                    extracted_fields: List[Dict[str, Any]]):
        """
        Insert multiple extracted fields in a batch.
        
        Args:
            document_id: Document ID
            extracted_fields: List of dicts with 'field_name', 'field_value', 'confidence'
        """
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            for field in extracted_fields:
                cursor.execute(
                    """INSERT INTO ExtractedData 
                       (DocumentID, FieldName, FieldValue, Confidence)
                       VALUES (?, ?, ?, ?)""",
                    (document_id, field['field_name'], 
                     field['field_value'], field['confidence'])
                )
            
            conn.commit()
            logger.info(f"Inserted {len(extracted_fields)} fields for document {document_id}")
            
        except Exception as e:
            logger.error(f"Error in batch insert: {str(e)}")
            conn.rollback()
            raise
        finally:
            cursor.close()
            conn.close()
    
    def get_extracted_data(self, document_id: int) -> List[Dict[str, Any]]:
        """Get all extracted data for a document"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute(
                """SELECT FieldName, FieldValue, Confidence, ExtractedTimestamp
                   FROM ExtractedData 
                   WHERE DocumentID = ?
                   ORDER BY FieldName""",
                (document_id,)
            )
            
            extracted_data = []
            for row in cursor.fetchall():
                extracted_data.append({
                    'FieldName': row[0],
                    'FieldValue': row[1],
                    'Confidence': row[2],
                    'ExtractedTimestamp': row[3]
                })
            
            return extracted_data
            
        finally:
            cursor.close()
            conn.close()
    
    # ==================== AUDIT OPERATIONS ====================
    
    def log_processing_step(self, document_id: int, step: str, 
                           status: str, details: str = None, error_details: str = None):
        """Log a processing step for audit trail"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute(
                """INSERT INTO ProcessingAudit 
                   (DocumentID, ProcessingStep, Status, Details, ErrorDetails)
                   VALUES (?, ?, ?, ?, ?)""",
                (document_id, step, status, details, error_details)
            )
            conn.commit()
            
        except Exception as e:
            logger.error(f"Error logging audit: {str(e)}")
            conn.rollback()
        finally:
            cursor.close()
            conn.close()
    
    def get_processing_history(self, document_id: int) -> List[Dict[str, Any]]:
        """Get complete processing history for a document"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute(
                """SELECT ProcessingStep, Status, Timestamp, Details, ErrorDetails
                   FROM ProcessingAudit 
                   WHERE DocumentID = ?
                   ORDER BY Timestamp""",
                (document_id,)
            )
            
            history = []
            for row in cursor.fetchall():
                history.append({
                    'ProcessingStep': row[0],
                    'Status': row[1],
                    'Timestamp': row[2],
                    'Details': row[3],
                    'ErrorDetails': row[4]
                })
            
            return history
            
        finally:
            cursor.close()
            conn.close()
    
    # ==================== USER OPERATIONS ====================
    
    def create_user(self, email: str, role: str = 'client') -> int:
        """Create a new user for dashboard access"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute(
                "INSERT INTO Users (Email, Role) VALUES (?, ?)",
                (email, role)
            )
            conn.commit()
            
            cursor.execute("SELECT @@IDENTITY")
            user_id = int(cursor.fetchone()[0])
            
            logger.info(f"Created user: {email} with role {role}")
            return user_id
            
        except Exception as e:
            logger.error(f"Error creating user: {str(e)}")
            conn.rollback()
            raise
        finally:
            cursor.close()
            conn.close()
    
    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get user details by email"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute(
                """SELECT UserID, Email, Role, CreatedDate, LastLogin, IsActive
                   FROM Users WHERE Email = ?""",
                (email,)
            )
            row = cursor.fetchone()
            
            if row:
                return {
                    'UserID': row[0],
                    'Email': row[1],
                    'Role': row[2],
                    'CreatedDate': row[3],
                    'LastLogin': row[4],
                    'IsActive': row[5]
                }
            return None
            
        finally:
            cursor.close()
            conn.close()