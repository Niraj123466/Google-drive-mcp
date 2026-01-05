import { drive } from './src/google/googleClient.js';
import fs from 'fs';
import { Readable } from 'stream';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');
const pdfParse = pdfParseModule.PDFParse || pdfParseModule;

async function downloadPdf(fileId: string): Promise<Buffer> {
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    (response.data as Readable).on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    (response.data as Readable).on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    (response.data as Readable).on('error', reject);
  });
}

async function extractTextFromPdf(pdfBuffer: Buffer, maxLines: number = 10): Promise<string[]> {
  const PDFParse = pdfParseModule.PDFParse;
  const parser = new PDFParse({ data: pdfBuffer });
  const result = await parser.getText();
  const lines = result.text
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0);
  return lines.slice(0, maxLines);
}

async function main() {
  const fileId = '1rZJPYvG4QmXXVMkhUmfaSRX3kS24lc64';
  const maxLines = 10;

  try {
    console.log('Downloading PDF from Google Drive...');
    const pdfBuffer = await downloadPdf(fileId);
    console.log(`Downloaded ${pdfBuffer.length} bytes\n`);

    console.log('Extracting text from PDF...');
    const lines = await extractTextFromPdf(pdfBuffer, maxLines);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`First ${lines.length} lines of 'Internation cyber laws.pdf':`);
    console.log('='.repeat(60) + '\n');

    lines.forEach((line, index) => {
      console.log(`${String(index + 1).padStart(2)}. ${line}`);
    });

    console.log(`\n${'='.repeat(60)}`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

