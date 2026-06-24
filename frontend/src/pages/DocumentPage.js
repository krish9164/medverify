import { Fragment, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getDocument, submitCorrection } from "../api";
import "./DocumentPage.css";

const STATUS_LABELS = {
  processing: "Processing",
  auto_approved: "Auto Approved",
  needs_review: "Needs Review",
  rejected: "Rejected",
};

const STATUS_CLASSES = {
  processing: "badge-gray",
  auto_approved: "badge-green",
  needs_review: "badge-yellow",
  rejected: "badge-red",
};

const VERDICT_CONFIG = {
  AUTO: { icon: "✅", label: "AUTO", className: "verdict-auto" },
  REVIEW: { icon: "⚠️", label: "REVIEW", className: "verdict-review" },
  REJECT: { icon: "❌", label: "REJECT", className: "verdict-reject" },
};

function formatFieldName(fieldName) {
  if (!fieldName) return "";
  return fieldName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatConfidence(score) {
  if (score === null || score === undefined) return "—";
  return `${Math.round(Number(score) * 100)}%`;
}

function StatusBadge({ status }) {
  const className = STATUS_CLASSES[status] || "badge-gray";
  const label = STATUS_LABELS[status] || status;
  return <span className={`status-badge ${className}`}>{label}</span>;
}

function VerdictBadge({ verdict }) {
  const config = VERDICT_CONFIG[verdict] || {
    icon: "",
    label: verdict,
    className: "verdict-review",
  };
  return (
    <span className={`verdict-badge ${config.className}`}>
      {config.icon} {config.label}
    </span>
  );
}

function DocumentPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [doc, setDoc] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDocument() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getDocument(id);
        if (!isMounted) return;
        setDoc(res.data);
      } catch (err) {
        if (!isMounted) return;
        setError("Failed to load this document. Please try again.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadDocument();
    return () => {
      isMounted = false;
    };
  }, [id]);

  function handleEditClick(extraction) {
    setEditingId(extraction.id);
    setEditValue(extraction.extracted_value ?? "");
    setSaveError(null);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditValue("");
    setSaveError(null);
  }

  async function handleSaveCorrection(extraction) {
    setSavingId(extraction.id);
    setSaveError(null);
    try {
      await submitCorrection(extraction.id, editValue);
      setDoc((prev) => ({
        ...prev,
        extractions: prev.extractions.map((item) =>
          item.id === extraction.id
            ? { ...item, extracted_value: editValue, verdict: "AUTO" }
            : item
        ),
      }));
      setEditingId(null);
      setEditValue("");
    } catch (err) {
      setSaveError("Failed to save correction. Please try again.");
    } finally {
      setSavingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="document-page">
        <p className="document-loading">Loading document...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="document-page">
        <p className="document-error">{error}</p>
        <button className="back-link" onClick={() => navigate("/dashboard")}>
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  if (!doc) {
    return null;
  }

  return (
    <div className="document-page">
      <button className="back-link" onClick={() => navigate("/dashboard")}>
        ← Back to Dashboard
      </button>

      <div className="document-header-card">
        <div className="header-top">
          <h1 className="document-filename">{doc.filename}</h1>
          <StatusBadge status={doc.status} />
        </div>
        <p className="processed-date">
          Processed {formatDate(doc.created_at)}
        </p>
      </div>

      <div className="extractions-section">
        {doc.extractions.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No extractions found</p>
          </div>
        ) : (
          <table className="extractions-table">
            <thead>
              <tr>
                <th>Field Name</th>
                <th>Extracted Value</th>
                <th>Verdict</th>
                <th>Confidence</th>
                <th>Reason</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {doc.extractions.map((extraction) => {
                const canEdit =
                  extraction.verdict === "REVIEW" ||
                  extraction.verdict === "REJECT";
                const isEditing = editingId === extraction.id;

                return (
                  <Fragment key={extraction.id}>
                    <tr>
                      <td className="field-name-cell">
                        {formatFieldName(extraction.field_name)}
                      </td>
                      <td>{extraction.extracted_value ?? "—"}</td>
                      <td>
                        <VerdictBadge verdict={extraction.verdict} />
                      </td>
                      <td>{formatConfidence(extraction.confidence_score)}</td>
                      <td className="reason-cell">{extraction.reason}</td>
                      <td>
                        {canEdit && !isEditing && (
                          <button
                            className="edit-button"
                            onClick={() => handleEditClick(extraction)}
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                    {isEditing && (
                      <tr className="edit-row">
                        <td colSpan={6}>
                          <div className="edit-form">
                            <input
                              className="edit-input"
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              autoFocus
                            />
                            <button
                              className="save-button"
                              onClick={() => handleSaveCorrection(extraction)}
                              disabled={savingId === extraction.id}
                            >
                              {savingId === extraction.id
                                ? "Saving..."
                                : "Save Correction"}
                            </button>
                            <button
                              className="cancel-button"
                              onClick={handleCancelEdit}
                              disabled={savingId === extraction.id}
                            >
                              Cancel
                            </button>
                          </div>
                          {saveError && (
                            <p className="save-error">{saveError}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default DocumentPage;
