import os

from flask import Blueprint, current_app, jsonify, request
from werkzeug.utils import secure_filename
from PyPDF2 import PdfReader

from services.db import (
    get_document_by_id,
    save_document,
    save_extractions,
    save_pipeline_run,
    update_document_status,
)
from services.agents import run_pipeline

bp = Blueprint("pipeline", __name__, url_prefix="/api")


def _allowed_file(filename):
    allowed_extensions = current_app.config.get("ALLOWED_EXTENSIONS", {"pdf"})
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in allowed_extensions
    )


def _extract_pdf_text(filepath):
    reader = PdfReader(filepath)
    pages_text = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages_text).strip()


@bp.route("/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"error": "No file part in request"}), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not _allowed_file(file.filename):
        return jsonify({"error": "Only PDF files are allowed"}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(current_app.config["UPLOAD_FOLDER"], filename)

    try:
        file.save(filepath)
    except OSError:
        return jsonify({"error": "Failed to save uploaded file"}), 500

    try:
        raw_text = _extract_pdf_text(filepath)
    except Exception:
        return jsonify({"error": "Failed to extract text from PDF"}), 500

    try:
        document_id = save_document(filename, raw_text)
    except Exception:
        return jsonify({"error": "Failed to save document to database"}), 500

    return (
        jsonify(
            {
                "document_id": document_id,
                "filename": filename,
                "message": "Document uploaded successfully",
            }
        ),
        201,
    )


@bp.route("/process/<int:document_id>", methods=["POST"])
def process(document_id):
    try:
        document = get_document_by_id(document_id)
    except Exception:
        return jsonify({"error": "Failed to look up document"}), 500

    if document is None:
        return jsonify({"error": "Document not found"}), 404

    try:
        result = run_pipeline(document["raw_text"])
    except Exception:
        return jsonify({"error": "Pipeline run failed"}), 500

    try:
        save_pipeline_run(
            document_id,
            result["extractor_output"],
            result["critic_output"],
            result["resolver_output"],
            result["total_tokens"],
            result["duration_seconds"],
        )
        save_extractions(document_id, result["extractions"])
        update_document_status(document_id, result["document_status"])
    except Exception:
        return jsonify({"error": "Failed to save pipeline results"}), 500

    return jsonify(
        {
            "document_id": document_id,
            "status": result["document_status"],
            "extractions": result["extractions"],
            "total_tokens": result["total_tokens"],
            "duration_seconds": result["duration_seconds"],
        }
    )