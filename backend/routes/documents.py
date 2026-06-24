from flask import Blueprint, jsonify, request

from services.db import (
    get_all_documents,
    get_document_by_id,
    get_extraction_by_id,
    get_stats,
    save_correction,
    update_extraction_after_review,
)

bp = Blueprint("documents", __name__, url_prefix="/api")


@bp.route("/documents", methods=["GET"])
def list_documents():
    try:
        documents = get_all_documents()
    except Exception:
        return jsonify({"error": "Failed to fetch documents"}), 500

    return jsonify(documents)


@bp.route("/document/<int:document_id>", methods=["GET"])
def get_document(document_id):
    try:
        document = get_document_by_id(document_id)
    except Exception:
        return jsonify({"error": "Failed to fetch document"}), 500

    if document is None:
        return jsonify({"error": "Document not found"}), 404

    return jsonify(document)


@bp.route("/review/<int:extraction_id>", methods=["POST"])
def review_extraction(extraction_id):
    body = request.get_json(silent=True) or {}
    corrected_value = body.get("corrected_value")

    if corrected_value is None:
        return jsonify({"error": "corrected_value is required"}), 400

    try:
        extraction = get_extraction_by_id(extraction_id)
    except Exception:
        return jsonify({"error": "Failed to fetch extraction"}), 500

    if extraction is None:
        return jsonify({"error": "Extraction not found"}), 404

    try:
        save_correction(extraction_id, extraction["extracted_value"], corrected_value)
        update_extraction_after_review(extraction_id, corrected_value, verdict="AUTO")
    except Exception:
        return jsonify({"error": "Failed to save correction"}), 500

    return jsonify(
        {
            "message": "Correction saved",
            "extraction_id": extraction_id,
            "corrected_value": corrected_value,
        }
    )


@bp.route("/stats", methods=["GET"])
def stats():
    try:
        data = get_stats()
    except Exception:
        return jsonify({"error": "Failed to fetch stats"}), 500

    total = data["total"]
    auto_approved = data["auto_approved"]
    auto_approval_rate = round((auto_approved / total) * 100, 2) if total else 0.0

    return jsonify(
        {
            "total": total,
            "auto_approved": auto_approved,
            "needs_review": data["needs_review"],
            "rejected": data["rejected"],
            "auto_approval_rate": auto_approval_rate,
        }
    )
