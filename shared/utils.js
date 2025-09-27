function detectDocumentType(filename) {
    const upper = filename.toUpperCase();
    
    if (upper.includes('T4A')) return 'T4A';
    if (upper.includes('T4E')) return 'T4E';
    if (upper.includes('T4')) return 'T4';
    if (upper.includes('T5') && upper.includes('008')) return 'T5008';
    if (upper.includes('T5')) return 'T5';
    if (upper.includes('T3')) return 'T3';
    if (upper.includes('T2202')) return 'T2202';
    if (upper.includes('RRSP')) return 'RRSP';
    if (upper.includes('DONATION') || upper.includes('CHARITABLE')) return 'Donation Receipt';
    
    return null;
}

module.exports = { detectDocumentType };