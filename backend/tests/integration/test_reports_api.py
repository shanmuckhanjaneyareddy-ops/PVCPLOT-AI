"""
Reports API integration tests.
Tests PDF, Excel and CSV formats.
"""
import pytest
import io
import pypdf


class TestReportsAPI:

    async def test_pdf_report_generates_successfully(self, client, auth_headers_owner):
        """PDF generation for monthly report must succeed and return valid PDF bytes"""
        resp = await client.post("/api/reports/generate", headers=auth_headers_owner, json={
            "report_type": "monthly_financial",
            "format": "pdf",
            "start_date": "2025-01-01T00:00:00",
            "end_date": "2025-01-31T23:59:59",
            "metrics": ["production", "quality", "sales"]
        })
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert len(resp.content) > 1000  # Non-empty PDF

    async def test_pdf_report_contains_footer_branding(self, client, auth_headers_owner):
        """PDF report must contain 'PVCPILOT' and '2026' in the footer"""
        resp = await client.post("/api/reports/generate", headers=auth_headers_owner, json={
            "report_type": "daily_production",
            "format": "pdf",
            "start_date": "2025-01-14T00:00:00",
            "end_date": "2025-01-14T23:59:59",
            "metrics": ["production"]
        })
        assert resp.status_code == 200

        # Extract PDF text
        pdf_reader = pypdf.PdfReader(io.BytesIO(resp.content))
        full_text = " ".join(page.extract_text() for page in pdf_reader.pages)

        # Allow case insensitive checks
        text_upper = full_text.upper()
        assert "PVCPILOT" in text_upper
        assert "2026" in text_upper
        assert "PVCPILOT" in text_upper

    async def test_excel_report_generates(self, client, auth_headers_owner):
        """Excel export must return valid .xlsx file"""
        resp = await client.post("/api/reports/generate", headers=auth_headers_owner, json={
            "report_type": "weekly_summary",
            "format": "excel",
            "start_date": "2025-01-08T00:00:00",
            "end_date": "2025-01-14T23:59:59",
            "metrics": ["production", "inventory"]
        })
        assert resp.status_code == 200
        ct = resp.headers["content-type"]
        assert "spreadsheet" in ct or "xlsx" in ct or "openxmlformats" in ct

    async def test_csv_report_generates(self, client, auth_headers_owner):
        """CSV export must return plain text CSV content"""
        resp = await client.post("/api/reports/generate", headers=auth_headers_owner, json={
            "report_type": "daily_production",
            "format": "csv",
            "start_date": "2025-01-14T00:00:00",
            "end_date": "2025-01-14T23:59:59",
            "metrics": ["production"]
        })
        assert resp.status_code == 200
        text = resp.text
        assert "," in text  # CSV structure
        assert len(text.split("\n")) > 1  # Has rows
