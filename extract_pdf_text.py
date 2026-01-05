#!/usr/bin/env python3
"""
Script to extract text from a PDF file stored in Google Drive.
Downloads the PDF and extracts the first N lines of text.
"""

import sys
import urllib.request
from io import BytesIO

try:
    import PyPDF2
except ImportError:
    print("PyPDF2 is not installed. Installing...")
    import subprocess
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "PyPDF2"], 
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        import PyPDF2
    except:
        print("Error: Could not install PyPDF2. Please install it manually:")
        print("  python3 -m pip install --user PyPDF2")
        sys.exit(1)


def download_pdf_from_drive(file_id: str) -> bytes:
    """Download PDF from Google Drive using the file ID."""
    download_url = f"https://drive.google.com/uc?id={file_id}&export=download"
    
    print(f"Downloading PDF from Google Drive...")
    try:
        with urllib.request.urlopen(download_url) as response:
            return response.read()
    except urllib.error.HTTPError as e:
        raise Exception(f"HTTP Error {e.code}: {e.reason}")
    except urllib.error.URLError as e:
        raise Exception(f"URL Error: {e.reason}")


def extract_text_from_pdf(pdf_bytes: bytes, max_lines: int = 10) -> list[str]:
    """Extract text from PDF bytes and return first N lines."""
    pdf_file = BytesIO(pdf_bytes)
    pdf_reader = PyPDF2.PdfReader(pdf_file)
    
    all_text = []
    
    print(f"Extracting text from {len(pdf_reader.pages)} pages...")
    
    # Extract text from all pages
    for page_num, page in enumerate(pdf_reader.pages, 1):
        try:
            text = page.extract_text()
            if text:
                lines = text.split('\n')
                all_text.extend([line.strip() for line in lines if line.strip()])
        except Exception as e:
            print(f"Warning: Could not extract text from page {page_num}: {e}")
    
    # Return first max_lines
    return all_text[:max_lines]


def main():
    # Google Drive file ID for "Internation cyber laws.pdf"
    file_id = "1rZJPYvG4QmXXVMkhUmfaSRX3kS24lc64"
    max_lines = 10
    
    try:
        # Download PDF
        pdf_bytes = download_pdf_from_drive(file_id)
        print(f"Downloaded {len(pdf_bytes)} bytes\n")
        
        # Extract text
        lines = extract_text_from_pdf(pdf_bytes, max_lines)
        
        # Display results
        print(f"\n{'='*60}")
        print(f"First {len(lines)} lines of 'Internation cyber laws.pdf':")
        print(f"{'='*60}\n")
        
        for i, line in enumerate(lines, 1):
            print(f"{i:2d}. {line}")
        
        print(f"\n{'='*60}")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

