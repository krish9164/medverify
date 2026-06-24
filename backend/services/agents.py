import json
import time

from openai import OpenAI

from config import Config

MODEL = "gpt-4o"

client = OpenAI(api_key=Config.OPENAI_API_KEY)

EXTRACTOR_SYSTEM_PROMPT = """You are a medical document data extraction agent.

You will be given the raw text of a medical document (this could be a prior \
authorization form, an EOB, a clinical note, a referral fax, or something else \
entirely). Documents vary widely in structure and content.

Your job:
- Read the entire document carefully.
- Discover and extract EVERY field of structured information present in the \
document. Do NOT rely on any fixed/predefined field list — the schema must be \
derived from what is actually in this specific document.
- Use clear, descriptive snake_case keys for each field (e.g. patient_name, \
date_of_birth, drug_name, dosage, diagnosis_code, prescriber_npi, payer_name, \
member_id, request_date, etc. — but include whatever fields you actually find, \
even if they are not in this example list).
- If a field is referenced but its value cannot be determined from the text, \
set its value to null. Do not omit fields you found just because they are \
incomplete.
- Do not invent values that are not supported by the text.

Respond with a single JSON object only. Top-level keys are the snake_case \
field names you discovered, and values are the extracted values (string, \
number, or null)."""

CRITIC_SYSTEM_PROMPT = """You are an independent quality-control reviewer for \
medical document data extraction.

You will be given the raw text of a medical document. You have NOT seen any \
other agent's extraction of this document, and you must not assume one exists. \
Review the document entirely on your own merits.

Your job:
- Identify every field of structured information that appears in the document.
- For each field, decide whether it is clearly and unambiguously present, or \
whether there is some problem with it.
- Flag fields that are: ambiguous (could be read more than one way), at risk \
of being misread (poor OCR/handwriting/formatting, lookalike characters, \
truncation), missing (referenced but not actually given a value), or \
inconsistent (contradicted elsewhere in the document).
- Only include fields that have an issue. Do not flag fields that are clean.

Respond with a single JSON object only, of the form:
{"flags": [{"field_name": "<snake_case_field_name>", "issue": "<one sentence \
description of the issue>", "severity": "LOW" | "MEDIUM" | "HIGH"}]}

If you find no issues at all, respond with {"flags": []}."""

RESOLVER_SYSTEM_PROMPT = """You are the final adjudicator in a three-agent \
medical document QC pipeline.

You will be given:
1. The original raw document text.
2. The extractor agent's output — a JSON object of field_name -> extracted_value.
3. The critic agent's flags — issues an independent reviewer found while \
reading the same document (without seeing the extractor's output).

Your job: for EVERY field present in the extractor output, decide:
- verdict: "AUTO" (you are confident the value is correct and complete, no \
human review needed), "REVIEW" (there is some ambiguity, risk of misread, or \
a critic flag that a human should check), or "REJECT" (the value is very \
likely wrong, missing when it shouldn't be, or contradicted by the document).
- confidence_score: a float from 0.0 to 1.0 reflecting your confidence in the \
extracted value.
- reason: one concise sentence explaining the verdict.

A field with no critic flag can still be AUTO if the value is clearly correct. \
A critic flag does not automatically force REJECT — weigh its severity and \
your own reading of the document.

Respond with a single JSON object only, of the form:
{"resolved_fields": [{"field_name": "<snake_case_field_name>", "verdict": \
"AUTO" | "REVIEW" | "REJECT", "confidence_score": <float>, "reason": \
"<one sentence>"}]}

Include one entry per field found in the extractor output."""


def _call_json_agent(system_prompt, user_content):
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
        temperature=0,
    )

    tokens = response.usage.total_tokens if response.usage else 0
    content = response.choices[0].message.content

    try:
        parsed = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        parsed = {}

    return parsed, tokens


def run_extractor(raw_text):
    parsed, tokens = _call_json_agent(EXTRACTOR_SYSTEM_PROMPT, raw_text)
    if not isinstance(parsed, dict):
        parsed = {}
    return parsed, tokens


def run_critic(raw_text):
    parsed, tokens = _call_json_agent(CRITIC_SYSTEM_PROMPT, raw_text)
    flags = parsed.get("flags") if isinstance(parsed, dict) else None
    if not isinstance(flags, list):
        flags = []
    return flags, tokens


def run_resolver(raw_text, extractor_output, critic_flags):
    user_content = json.dumps(
        {
            "document_text": raw_text,
            "extractor_output": extractor_output,
            "critic_flags": critic_flags,
        }
    )
    parsed, tokens = _call_json_agent(RESOLVER_SYSTEM_PROMPT, user_content)
    resolved_fields = parsed.get("resolved_fields") if isinstance(parsed, dict) else None
    if not isinstance(resolved_fields, list):
        resolved_fields = []
    return resolved_fields, tokens


def _stringify(value):
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value)


def _build_extractions(extractor_output, resolver_output):
    resolved_by_field = {
        field.get("field_name"): field
        for field in resolver_output
        if isinstance(field, dict)
    }

    extractions = []
    for field_name, value in extractor_output.items():
        resolved = resolved_by_field.get(field_name, {})
        extractions.append(
            {
                "field_name": field_name,
                "extracted_value": _stringify(value),
                "verdict": resolved.get("verdict", "REVIEW"),
                "confidence_score": resolved.get("confidence_score", 0.0),
                "reason": resolved.get("reason", "No resolver verdict returned for this field."),
            }
        )
    return extractions


def _determine_document_status(extractions):
    verdicts = {extraction["verdict"] for extraction in extractions}
    if "REJECT" in verdicts:
        return "rejected"
    if "REVIEW" in verdicts:
        return "needs_review"
    return "auto_approved"


def run_pipeline(raw_text):
    start_time = time.time()

    extractor_output, extractor_tokens = run_extractor(raw_text)
    critic_output, critic_tokens = run_critic(raw_text)
    resolver_output, resolver_tokens = run_resolver(raw_text, extractor_output, critic_output)

    extractions = _build_extractions(extractor_output, resolver_output)
    document_status = _determine_document_status(extractions)

    total_tokens = extractor_tokens + critic_tokens + resolver_tokens
    duration_seconds = time.time() - start_time

    return {
        "extractor_output": extractor_output,
        "critic_output": critic_output,
        "resolver_output": resolver_output,
        "extractions": extractions,
        "total_tokens": total_tokens,
        "duration_seconds": duration_seconds,
        "document_status": document_status,
    }