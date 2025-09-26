import logging
from shared.database import DatabaseManager

# Set up logging
logging.basicConfig(level=logging.INFO)

def test_database_operations():
    """Test all database operations"""
    db = DatabaseManager()
    
    try:
        # Test 1: Create client
        print("\n=== Test 1: Create Client ===")
        client_id = db.get_or_create_client(
            email="john.doe@example.com",
            name="John Doe"
        )
        print(f"✓ Client created/retrieved: ID = {client_id}")
        
        # Test 2: Create document
        print("\n=== Test 2: Create Document ===")
        doc_id = db.create_document(
            client_id=client_id,
            original_filename="T4_2024.pdf",
            blob_path="email-attachments/john.doe@example.com_2025-01-15/T4_2024.pdf",
            document_type="T4"
        )
        print(f"✓ Document created: ID = {doc_id}")
        
        # Test 3: Update document status
        print("\n=== Test 3: Update Document Status ===")
        db.update_document_status(doc_id, "processing")
        print(f"✓ Document {doc_id} status updated to 'processing'")
        
        # Test 4: Insert extracted data
        print("\n=== Test 4: Insert Extracted Data ===")
        db.insert_extracted_data(
            document_id=doc_id,
            field_name="SIN",
            field_value="123-456-789",
            confidence=95.5
        )
        db.insert_extracted_data(
            document_id=doc_id,
            field_name="Box14_EmploymentIncome",
            field_value="65000.00",
            confidence=98.2
        )
        print(f"✓ Extracted data inserted")
        
        # Test 5: Log audit
        print("\n=== Test 5: Log Processing Step ===")
        db.log_processing_step(
            document_id=doc_id,
            step="AI Processing Started",
            status="success",
            details="Document Intelligence called for T4 analysis"
        )
        print(f"✓ Audit log created")
        
        # Test 6: Retrieve data
        print("\n=== Test 6: Retrieve Document ===")
        doc = db.get_document_by_id(doc_id)
        print(f"✓ Document retrieved: {doc['OriginalFileName']}")
        
        print("\n=== Test 7: Get Extracted Data ===")
        extracted = db.get_extracted_data(doc_id)
        for field in extracted:
            print(f"  - {field['FieldName']}: {field['FieldValue']} ({field['Confidence']}%)")
        
        # Test 8: Complete processing
        print("\n=== Test 8: Complete Processing ===")
        db.update_document_status(doc_id, "completed", confidence=96.8)
        print(f"✓ Document {doc_id} marked as completed")
        
        print("\n✓ All tests passed!")
        
    except Exception as e:
        print(f"\n✗ Test failed: {str(e)}")
        raise

if __name__ == "__main__":
    test_database_operations()