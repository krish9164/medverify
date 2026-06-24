import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllDocuments, getStats } from "../api";
import "./DashboardPage.css";

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

function StatusBadge({ status }) {
  const className = STATUS_CLASSES[status] || "badge-gray";
  const label = STATUS_LABELS[status] || status;
  return <span className={`status-badge ${className}`}>{label}</span>;
}

function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        const [statsRes, documentsRes] = await Promise.all([
          getStats(),
          getAllDocuments(),
        ]);
        if (!isMounted) return;
        setStats(statsRes.data);
        setDocuments(documentsRes.data);
      } catch (err) {
        if (!isMounted) return;
        setError("Failed to load dashboard data. Please try again.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const statCards = stats
    ? [
        {
          label: "Total Documents",
          value: stats.total,
          className: "stat-neutral",
          filterStatus: null,
          clickable: true,
        },
        {
          label: "Auto Approved",
          value: stats.auto_approved,
          className: "stat-green",
          filterStatus: "auto_approved",
          clickable: true,
        },
        {
          label: "Needs Review",
          value: stats.needs_review,
          className: "stat-yellow",
          filterStatus: "needs_review",
          clickable: true,
        },
        {
          label: "Rejected",
          value: stats.rejected,
          className: "stat-red",
          filterStatus: "rejected",
          clickable: true,
        },
        {
          label: "Auto Approval Rate",
          value: `${stats.auto_approval_rate}%`,
          className: "stat-blue",
          clickable: false,
        },
      ]
    : [];

  function handleCardClick(card) {
    if (!card.clickable) return;
    if (card.filterStatus === null) {
      setStatusFilter(null);
      return;
    }
    setStatusFilter((prev) => (prev === card.filterStatus ? null : card.filterStatus));
  }

  const filteredDocuments = statusFilter
    ? documents.filter((doc) => doc.status === statusFilter)
    : documents;

  return (
    <div className="dashboard-page">
      <h1 className="dashboard-title">Dashboard</h1>

      {error && <p className="dashboard-error">{error}</p>}

      {isLoading ? (
        <p className="dashboard-loading">Loading dashboard...</p>
      ) : (
        <>
          {stats && (
            <div className="stats-bar">
              {statCards.map((card) => {
                const isActive = card.clickable && card.filterStatus === statusFilter;
                return (
                  <div
                    key={card.label}
                    className={
                      `stat-card ${card.className}` +
                      (card.clickable ? " stat-card-clickable" : "") +
                      (isActive ? " stat-card-active" : "")
                    }
                    onClick={() => handleCardClick(card)}
                    role={card.clickable ? "button" : undefined}
                    tabIndex={card.clickable ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (card.clickable && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        handleCardClick(card);
                      }
                    }}
                  >
                    <div className="stat-value">{card.value}</div>
                    <div className="stat-label">{card.label}</div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="documents-section">
            {statusFilter && (
              <div className="filter-banner">
                <span>
                  Showing only <strong>{STATUS_LABELS[statusFilter]}</strong> documents
                </span>
                <button className="clear-filter-button" onClick={() => setStatusFilter(null)}>
                  Clear filter
                </button>
              </div>
            )}

            {documents.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state-title">No documents yet</p>
                <p className="empty-state-subtext">
                  Upload a document to see it appear here.
                </p>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state-title">No documents match this filter</p>
                <p className="empty-state-subtext">
                  Try clearing the filter to see all documents.
                </p>
              </div>
            ) : (
              <table className="documents-table">
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Status</th>
                    <th>Date Uploaded</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocuments.map((doc) => (
                    <tr key={doc.id}>
                      <td className="filename-cell">{doc.filename}</td>
                      <td>
                        <StatusBadge status={doc.status} />
                      </td>
                      <td>{formatDate(doc.created_at)}</td>
                      <td>
                        <button
                          className="view-button"
                          onClick={() => navigate(`/document/${doc.id}`)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default DashboardPage;
