import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadDocument, processDocument } from "../api";
import "./UploadPage.css";

const STEPS = [
  "Extracting fields...",
  "Running quality check...",
  "Resolving conflicts...",
];

const STEP_DELAY_MS = 1000;

function UploadPage() {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  // Number of steps whose completion is purely timer-driven (steps 1 and 2
  // only — step 3 has no fixed timer, it waits on the real API call below).
  const [timerStep, setTimerStep] = useState(0);
  const [apiDone, setApiDone] = useState(false);
  const [documentId, setDocumentId] = useState(null);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);
  const isPickerOpenRef = useRef(false);
  const navigate = useNavigate();

  // Step 3 only counts as complete once the real pipeline call has resolved,
  // so the spinner on step 3 stays active for however long that actually takes.
  const completedSteps =
    apiDone && timerStep >= STEPS.length - 1 ? STEPS.length : timerStep;
  const activeStepIndex = completedSteps < STEPS.length ? completedSteps : -1;

  useEffect(() => {
    if (!isProcessing) return;

    const timers = [];
    for (let step = 1; step < STEPS.length; step += 1) {
      timers.push(setTimeout(() => setTimerStep(step), step * STEP_DELAY_MS));
    }

    return () => timers.forEach(clearTimeout);
  }, [isProcessing]);

  useEffect(() => {
    if (isProcessing && completedSteps === STEPS.length && documentId) {
      navigate(`/document/${documentId}`);
    }
  }, [isProcessing, completedSteps, documentId, navigate]);

  function selectFile(candidate) {
    if (!candidate) return;
    if (candidate.type !== "application/pdf" && !candidate.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are allowed.");
      return;
    }
    setError(null);
    setFile(candidate);
  }

  function handleDropZoneClick() {
    // The hidden input sits underneath this div and natively opens its own
    // file dialog when clicked directly; that native click then bubbles up
    // to this handler too. Without the guard below, the input ends up
    // opened twice (visible on Windows as a picker that reopens after the
    // first file is chosen).
    if (isPickerOpenRef.current) return;
    isPickerOpenRef.current = true;
    fileInputRef.current?.click();
    setTimeout(() => {
      isPickerOpenRef.current = false;
    }, 300);
  }

  function handleFileChange(event) {
    selectFile(event.target.files[0]);
  }

  function handleDragOver(event) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files[0]);
  }

  async function handleUploadAndAnalyze() {
    if (!file) {
      setError("Please select a PDF file first.");
      return;
    }

    setError(null);
    setApiDone(false);
    setTimerStep(0);
    setDocumentId(null);
    setIsProcessing(true);

    try {
      const uploadRes = await uploadDocument(file);
      const newDocumentId = uploadRes.data.document_id;
      setDocumentId(newDocumentId);

      await processDocument(newDocumentId);
      setApiDone(true);
    } catch (err) {
      setError("Something went wrong while processing this document. Please try again.");
      setIsProcessing(false);
    }
  }

  if (isProcessing) {
    return (
      <div className="upload-page">
        <div className="upload-card">
          <h2 className="processing-title">Analyzing document...</h2>
          <ul className="steps-list">
            {STEPS.map((label, index) => {
              const isDone = index < completedSteps;
              const isActive = index === activeStepIndex;
              return (
                <li key={label} className="step-item">
                  <span
                    className={
                      "step-indicator" +
                      (isDone ? " step-done" : "") +
                      (isActive ? " step-active" : "")
                    }
                  >
                    {isDone ? "✓" : isActive ? <span className="spinner" /> : ""}
                  </span>
                  <span className={"step-label" + (isDone ? " step-label-done" : "")}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
          {error && <p className="upload-error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="upload-page">
      <div className="upload-card">
        <h1 className="upload-title">MedVerify</h1>
        <p className="upload-subtitle">
          Upload a medical document to extract and verify its data automatically.
        </p>

        <div
          className={"dropzone" + (isDragging ? " dropzone-active" : "")}
          onClick={handleDropZoneClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            className="dropzone-input"
          />
          <div className="dropzone-icon">📄</div>
          {file ? (
            <p className="dropzone-filename">{file.name}</p>
          ) : (
            <>
              <p className="dropzone-text">Drop your medical document here</p>
              <p className="dropzone-subtext">or click to select a PDF</p>
            </>
          )}
        </div>

        {error && <p className="upload-error">{error}</p>}

        <button
          className="upload-button"
          onClick={handleUploadAndAnalyze}
          disabled={!file}
        >
          Upload &amp; Analyze
        </button>
      </div>
    </div>
  );
}

export default UploadPage;
