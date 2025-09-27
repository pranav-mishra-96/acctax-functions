/**
 * Detect Canadian tax document type from filename
 * @param {string} filename - The name of the uploaded file
 * @returns {string|null} - Document type or null if unknown
 */
function detectDocumentType(filename) {
    if (!filename) return null;
    
    const upper = filename.toUpperCase();
    
    // Order matters - check specific types before general ones
    if (upper.includes('T5008')) return 'T5008';
    if (upper.includes('T5013')) return 'T5013';
    if (upper.includes('T4A')) return 'T4A';
    if (upper.includes('T4E')) return 'T4E';
    if (upper.includes('T4')) return 'T4';
    if (upper.includes('T5')) return 'T5';
    if (upper.includes('T3')) return 'T3';
    if (upper.includes('T2202')) return 'T2202';
    if (upper.includes('T2202A')) return 'T2202A';
    if (upper.includes('RC62')) return 'RC62';
    if (upper.includes('RRSP')) return 'RRSP';
    if (upper.includes('RRIF')) return 'RRIF';
    if (upper.includes('TFSA')) return 'TFSA';
    if (upper.includes('DONATION') || upper.includes('CHARITABLE')) return 'Donation Receipt';
    if (upper.includes('NR4')) return 'NR4';
    if (upper.includes('T1135')) return 'T1135';
    
    return null;
}

/**
 * Validate if a file type is supported
 * @param {string} contentType - MIME type of the file
 * @returns {boolean}
 */
function isSupportedFileType(contentType) {
    const supportedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png'
    ];
    
    return supportedTypes.includes(contentType?.toLowerCase());
}

/**
 * Extract tax year from filename if present
 * @param {string} filename
 * @returns {number|null}
 */
function extractTaxYear(filename) {
    if (!filename) return null;
    
    // Look for 4-digit year (2020-2030)
    const yearMatch = filename.match(/20[2-3][0-9]/);
    return yearMatch ? parseInt(yearMatch[0]) : null;
}

/**
 * Generate a clean blob path
 * @param {string} clientEmail
 * @param {string} filename
 * @returns {string}
 */
function generateBlobPath(clientEmail, filename) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const sanitizedEmail = clientEmail.replace(/[^a-zA-Z0-9@.-]/g, '_');
    return `email-attachments/${sanitizedEmail}_${timestamp}/${filename}`;
}

module.exports = { 
    detectDocumentType,
    isSupportedFileType,
    extractTaxYear,
    generateBlobPath
};