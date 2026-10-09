export class AddressNormalizer {
  /**
   * Normalize a Vietnamese address string:
   * 1. Lowercase & trim
   * 2. Decompose Unicode accents (NFD) & handle đ/Đ
   * 3. Replace punctuation (dots, commas, slashes) with spaces
   * 4. Expand common Vietnamese administrative & street abbreviations using word boundaries
   * 5. Strip remaining special characters and collapse spaces
   */
  static normalize(address: string): string {
    if (!address) return '';

    let text = address.toLowerCase().trim();

    // Remove Vietnamese diacritics
    text = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd');

    // Replace punctuation symbols (comma, dot, slash, hyphen) with space
    text = text.replace(/[,./\\-]/g, ' ');

    // Pad with spaces for word boundary matching
    text = ` ${text} `;

    // Expand common abbreviations using word boundaries (\b)
    text = text
      .replace(/\b(p|ph)\b/g, 'phuong')
      .replace(/\b(q)\b/g, 'quan')
      .replace(/\b(d)\b/g, 'duong')
      .replace(/\b(tp|tphcm)\b/g, 'thanh pho ho chi minh')
      .replace(/\b(h)\b/g, 'huyen');

    // Strip any remaining non-alphanumeric characters except spaces
    text = text.replace(/[^a-z0-9\s]/g, ' ');

    // Collapse multiple whitespace spaces into a single space
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Basic string similarity check (checks if two normalized strings share address/name overlap)
   */
  static isMatch(addr1: string, addr2: string): boolean {
    const norm1 = this.normalize(addr1);
    const norm2 = this.normalize(addr2);

    if (!norm1 || !norm2) return false;
    if (norm1 === norm2) return true;
    if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

    return false;
  }
}
