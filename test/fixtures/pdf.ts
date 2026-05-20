function escapeText(lines: string[]) {
  return lines
    .join("\n")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\n/g, ") Tj T* (");
}

function buildPageStream(lines: string[]) {
  const escapedText = escapeText(lines);
  return `BT /F1 12 Tf 14 TL 72 720 Td (${escapedText}) Tj ET`;
}

export function createPdfFixture(lines: string[]) {
  return createMultiPagePdfFixture([lines]);
}

export function createMultiPagePdfFixture(pages: string[][]) {
  const pageCount = pages.length;
  const fontObjId = 3 + pageCount * 2;
  const fontObj = `${fontObjId} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`;
  const objects: string[] = [];
  // 1 = catalog, 2 = pages
  const kidsRefs: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    const pageId = 3 + i * 2;
    kidsRefs.push(`${pageId} 0 R`);
  }
  objects.push(`1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj`);
  objects.push(
    `2 0 obj << /Type /Pages /Kids [${kidsRefs.join(" ")}] /Count ${pageCount} >> endobj`,
  );
  for (let i = 0; i < pageCount; i++) {
    const pageId = 3 + i * 2;
    const contentId = pageId + 1;
    objects.push(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjId} 0 R >> >> /Contents ${contentId} 0 R >> endobj`,
    );
    const stream = buildPageStream(pages[i]);
    objects.push(
      `${contentId} 0 obj << /Length ${Buffer.byteLength(stream, "latin1")} >> stream\n${stream}\nendstream endobj`,
    );
  }
  objects.push(fontObj);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
