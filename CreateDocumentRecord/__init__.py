import logging
import json
import azure.functions as func
from datetime import datetime
import sys
import os

# Add parent directory to path to import shared modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from shared.database import DatabaseManager
from shared.config import Config

def main(req: func.HttpRequest) -> func.HttpResponse:
    """
    HTTP triggered function to create database records when files arrive via email.
    
    Expected JSON payload:
    {
        "clientEmail": "john@example.com",
        "clientName": "John Doe",
        "folderPath": "john@example.com_2025-09-26-10-30",
        "attachments": [
            {
                "fileName": "T4_2024.pdf",
                "contentType": "application/pdf",
                "size": 245678
            }
        ]
    }
    """
    logging.info('CreateDocumentRecord function triggered')
    
    try:
        # Parse request body
        req_body = req.get_json()
        logging.info(f"Received request: {json.dumps(req_body)}")
        
        # Extract required fields
        client_email = req_body.get('clientEmail')
        client_name = req_body.get('clientName', client_email.split('@')[0] if client_email else 'Unknown')
        folder_path = req_body.get('folderPath')
        attachments = req_body.get('attachments', [])
        
        # Validate required fields
        if not client_email:
            return func.HttpResponse(
                json.dumps({"error": "clientEmail is required"}),
                status_code=400,
                mimetype="application/json"
            )
        
        if not folder_path:
            return func.HttpResponse(
                json.dumps({"error": "folderPath is required"}),
                status_code=400,
                mimetype="application/json"
            )
        
        if not attachments or len(attachments) == 0:
            return func.HttpResponse(
                json.dumps({"error": "At least one attachment is required"}),
                status_code=400,
                mimetype="application/json"
            )
        
        # Initialize database manager
        db = DatabaseManager()
        
        # Get or create client
        logging.info(f"Getting or creating client: {client_email}")
        client_id = db.get_or_create_client(client_email, client_name)
        logging.info(f"Client ID: {client_id}")
        
        # Create document records for each attachment
        created_documents = []
        
        for attachment in attachments:
            file_name = attachment.get('fileName')
            content_type = attachment.get('contentType', 'application/octet-stream')
            file_size = attachment.get('size', 0)
            
            if not file_name:
                logging.warning("Skipping attachment without fileName")
                continue
            
            # Determine document type from filename
            document_type = detect_document_type(file_name)
            
            # Create blob path
            blob_path = f"email-attachments/{folder_path}/{file_name}"
            
            # Create document record
            logging.info(f"Creating document record for: {file_name}")
            document_id = db.create_document(
                client_id=client_id,
                original_filename=file_name,
                blob_path=blob_path,
                document_type=document_type
            )
            
            # Log audit trail
            db.log_processing_step(
                document_id=document_id,
                step="Document received via email",
                status="success",
                details=f"File: {file_name}, Size: {file_size} bytes, Type: {content_type}"
            )
            
            created_documents.append({
                "documentId": document_id,
                "fileName": file_name,
                "documentType": document_type,
                "blobPath": blob_path
            })
            
            logging.info(f"Created document ID: {document_id}")
        
        # Prepare response
        response = {
            "success": True,
            "clientId": client_id,
            "clientEmail": client_email,
            "documentsCreated": len(created_documents),
            "documents": created_documents,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        logging.info(f"Successfully processed {len(created_documents)} documents")
        
        return func.HttpResponse(
            json.dumps(response),
            status_code=200,
            mimetype="application/json"
        )
    
    except ValueError as ve:
        # JSON parsing error
        logging.error(f"Invalid JSON in request: {str(ve)}")
        return func.HttpResponse(
            json.dumps({"error": "Invalid JSON in request body"}),
            status_code=400,
            mimetype="application/json"
        )
    
    except Exception as e:
        # Unexpected error
        logging.error(f"Error creating document records: {str(e)}", exc_info=True)
        return func.HttpResponse(
            json.dumps({
                "error": "Internal server error",
                "details": str(e)
            }),
            status_code=500,
            mimetype="application/json"
        )


def detect_document_type(filename: str) -> str:
    """
    Detect Canadian tax document type from filename.
    
    Args:
        filename: The name of the file
        
    Returns:
        Document type (T4, T4A, T5, etc.) or None
    """
    filename_upper = filename.upper()
    
    # Check for common tax form patterns
    if 'T4A' in filename_upper:
        return 'T4A'
    elif 'T4E' in filename_upper:
        return 'T4E'
    elif 'T4' in filename_upper:
        return 'T4'
    elif 'T5' in filename_upper and '008' in filename_upper:
        return 'T5008'
    elif 'T5' in filename_upper:
        return 'T5'
    elif 'T3' in filename_upper:
        return 'T3'
    elif 'T2202' in filename_upper:
        return 'T2202'
    elif 'RRSP' in filename_upper:
        return 'RRSP'
    elif 'DONATION' in filename_upper or 'CHARITABLE' in filename_upper:
        return 'Donation Receipt'
    
    # Default: unknown type (will be detected by AI later)
    return None