import json

import pymysql
import pymysql.cursors

from config import Config


def get_connection():
    return pymysql.connect(
        host=Config.DB_HOST,
        user=Config.DB_USER,
        password=Config.DB_PASSWORD,
        database=Config.DB_NAME,
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


def save_document(filename, raw_text):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO documents (filename, raw_text, status)
                VALUES (%s, %s, 'processing')
                """,
                (filename, raw_text),
            )
            document_id = cursor.lastrowid
        conn.commit()
        return document_id
    finally:
        conn.close()


def update_document_status(document_id, status):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE documents SET status = %s WHERE id = %s",
                (status, document_id),
            )
        conn.commit()
    finally:
        conn.close()


def save_pipeline_run(
    document_id,
    extractor_output,
    critic_output,
    resolver_output,
    total_tokens,
    duration_seconds,
):
    def to_text(value):
        if isinstance(value, (dict, list)):
            return json.dumps(value)
        return value

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO pipeline_runs (
                    document_id, extractor_output, critic_output,
                    resolver_output, total_tokens, duration_seconds
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    document_id,
                    to_text(extractor_output),
                    to_text(critic_output),
                    to_text(resolver_output),
                    total_tokens,
                    duration_seconds,
                ),
            )
            pipeline_run_id = cursor.lastrowid
        conn.commit()
        return pipeline_run_id
    finally:
        conn.close()


def save_extractions(document_id, extractions):
    if not extractions:
        return

    rows = [
        (
            document_id,
            extraction["field_name"],
            extraction.get("extracted_value"),
            extraction.get("verdict"),
            extraction.get("confidence_score"),
            extraction.get("reason"),
        )
        for extraction in extractions
    ]

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO extractions (
                    document_id, field_name, extracted_value,
                    verdict, confidence_score, reason
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                rows,
            )
        conn.commit()
    finally:
        conn.close()


def get_all_documents():
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM documents ORDER BY created_at DESC")
            return cursor.fetchall()
    finally:
        conn.close()


def get_document_by_id(document_id):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM documents WHERE id = %s", (document_id,)
            )
            document = cursor.fetchone()
            if document is None:
                return None

            cursor.execute(
                "SELECT * FROM extractions WHERE document_id = %s",
                (document_id,),
            )
            document["extractions"] = cursor.fetchall()
            return document
    finally:
        conn.close()


def get_extraction_by_id(extraction_id):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM extractions WHERE id = %s", (extraction_id,)
            )
            return cursor.fetchone()
    finally:
        conn.close()


def update_extraction_after_review(extraction_id, corrected_value, verdict="AUTO"):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE extractions
                SET extracted_value = %s, verdict = %s
                WHERE id = %s
                """,
                (corrected_value, verdict, extraction_id),
            )
        conn.commit()
    finally:
        conn.close()


def save_correction(extraction_id, original_value, corrected_value):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO corrections (extraction_id, original_value, corrected_value)
                VALUES (%s, %s, %s)
                """,
                (extraction_id, original_value, corrected_value),
            )
            correction_id = cursor.lastrowid
        conn.commit()
        return correction_id
    finally:
        conn.close()


def get_stats():
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    COUNT(*) AS total,
                    SUM(status = 'auto_approved') AS auto_approved,
                    SUM(status = 'needs_review') AS needs_review,
                    SUM(status = 'rejected') AS rejected
                FROM documents
                """
            )
            row = cursor.fetchone()
            return {
                "total": row["total"] or 0,
                "auto_approved": row["auto_approved"] or 0,
                "needs_review": row["needs_review"] or 0,
                "rejected": row["rejected"] or 0,
            }
    finally:
        conn.close()