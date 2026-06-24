import axios from "axios";

const BASE_URL = "http://medverify-env.eba-kmdz7qcu.us-east-1.elasticbeanstalk.com";

const client = axios.create({
  baseURL: BASE_URL,
});

export function uploadDocument(file) {
  const formData = new FormData();
  formData.append("file", file);

  return client.post("/api/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export function processDocument(documentId) {
  return client.post(`/api/process/${documentId}`);
}

export function getAllDocuments() {
  return client.get("/api/documents");
}

export function getDocument(documentId) {
  return client.get(`/api/document/${documentId}`);
}

export function getStats() {
  return client.get("/api/stats");
}

export function submitCorrection(extractionId, correctedValue) {
  return client.post(`/api/review/${extractionId}`, {
    corrected_value: correctedValue,
  });
}
