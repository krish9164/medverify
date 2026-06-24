import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import "./App.css";
import UploadPage from "./pages/UploadPage";
import DashboardPage from "./pages/DashboardPage";
import DocumentPage from "./pages/DocumentPage";

function Navbar() {
  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        MedVerify
      </Link>
      <Link to="/dashboard" className="navbar-link">
        Dashboard
      </Link>
    </nav>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/document/:id" element={<DocumentPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;
